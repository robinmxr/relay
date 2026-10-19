import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { FileInfo } from '@relay/shared';
import type { Ctx } from '../context';
import { HttpError, parse } from '../errors';
import { cleanFileName, cleanMime, isImage } from '../files';
import { requireChannel } from '../queries';
import { idParams, me, rateKey } from './util';

export function fileRoutes(app: FastifyInstance, ctx: Ctx): void {
  const { db, files } = ctx;

  // One file per request (multipart field "file"). The file is attached when a message is posted with its id.
  app.post(
    '/api/channels/:id/files',
    { config: { rateLimit: { max: ctx.limits.uploadsPerMinute, timeWindow: '1 minute', keyGenerator: rateKey } } },
    async (req): Promise<FileInfo> => {
      const user = me(req);
      const { id } = parse(idParams, req.params);
      await requireChannel(db, id, user.id, { member: true });
      if (!req.isMultipart()) throw new HttpError(400, 'Expected a multipart upload');
      const part = await req.file();
      if (!part) throw new HttpError(400, 'No file in the upload');

      const key = randomUUID();
      let size: number;
      try {
        size = await files.save(key, part.file);
      } catch (err) {
        if ((err as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') throw new HttpError(413, 'Files can be up to 25 MB');
        throw err;
      }
      if (part.file.truncated) {
        await files.remove(key);
        throw new HttpError(413, 'Files can be up to 25 MB');
      }

      const name = cleanFileName(part.filename);
      const mime = cleanMime(part.mimetype);
      const rows = await db.query<{ id: string }>(
        'insert into files (channel_id, uploader_id, name, mime, size, storage_key) values ($1, $2, $3, $4, $5, $6) returning id',
        [id, user.id, name, mime, size, key],
      );
      return files.info({ id: rows[0].id, name, mime, size });
    },
  );

  // Authorised by the URL signature, so <img src> works without a header.
  app.get('/api/files/:id', async (req, reply) => {
    const { id } = parse(idParams, req.params);
    const q = parse(z.object({ exp: z.coerce.number().int(), sig: z.string().max(100) }), req.query);
    if (!files.verify(id, q.exp, q.sig)) throw new HttpError(403, 'Link expired or invalid');
    const rows = await db.query<{ name: string; mime: string; size: string; storage_key: string }>(
      'select name, mime, size, storage_key from files where id = $1',
      [id],
    );
    const f = rows[0];
    if (!f) throw new HttpError(404, 'File not found');
    // Only known image types render inline; everything else downloads, so an uploaded HTML or SVG file never runs.
    const inline = isImage(f.mime);
    reply
      .header('Content-Type', inline ? f.mime : 'application/octet-stream')
      .header('Content-Length', f.size)
      .header('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`)
      .header('Cache-Control', 'private, max-age=86400');
    return reply.send(files.read(f.storage_key));
  });
}
