import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LIMITS } from '@relay/shared';
import type { Ctx } from '../context';
import { HttpError, parse } from '../errors';
import { saveMentions } from '../mentions';
import { getMessage, listMessages, requireChannel } from '../queries';
import { idParams, me, rateKey, uuid } from './util';

const postMessageBody = z
  .object({
    body: z.string().trim().max(LIMITS.messageBody).default(''),
    parentId: uuid.optional(),
    fileIds: z.array(uuid).max(LIMITS.filesPerMessage).default([]),
  })
  .refine((b) => b.body.length > 0 || b.fileIds.length > 0, { message: 'a message needs text or a file', path: ['body'] });

export function channelRoutes(app: FastifyInstance, ctx: Ctx): void {
  const { db, hub, files } = ctx;

  app.post('/api/channels/:id/join', async (req) => {
    const user = me(req);
    const { id } = parse(idParams, req.params);
    const access = await requireChannel(db, id, user.id);
    if (access.is_private || access.is_dm) throw new HttpError(404, 'Channel not found');
    await db.query('insert into channel_members (channel_id, user_id) values ($1, $2) on conflict do nothing', [id, user.id]);
    await hub.publish({ to: [user.id], event: { type: 'channels.changed', workspaceId: access.workspace_id } });
    return { ok: true };
  });

  app.post('/api/channels/:id/read', async (req) => {
    const user = me(req);
    const { id } = parse(idParams, req.params);
    await db.query('update channel_members set last_read_at = now() where channel_id = $1 and user_id = $2', [id, user.id]);
    return { ok: true };
  });

  app.get('/api/channels/:id/messages', async (req) => {
    const user = me(req);
    const { id } = parse(idParams, req.params);
    const q = parse(
      z.object({
        before: z.string().datetime().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(LIMITS.pageSize),
      }),
      req.query,
    );
    await requireChannel(db, id, user.id);
    return listMessages(db, files, id, q.before ?? null, q.limit);
  });

  app.post(
    '/api/channels/:id/messages',
    { config: { rateLimit: { max: ctx.limits.messagesPer10Seconds, timeWindow: '10 seconds', keyGenerator: rateKey } } },
    async (req) => {
      const user = me(req);
      const { id } = parse(idParams, req.params);
      const body = parse(postMessageBody, req.body);
      const access = await requireChannel(db, id, user.id, { member: true });

      if (body.parentId) {
        const parent = await db.query<{ channel_id: string; parent_id: string | null; deleted_at: Date | null }>(
          'select channel_id, parent_id, deleted_at from messages where id = $1',
          [body.parentId],
        );
        const p = parent[0];
        if (!p || p.channel_id !== id || p.parent_id || p.deleted_at) throw new HttpError(400, 'Invalid thread');
      }

      const fileIds = [...new Set(body.fileIds)];
      if (fileIds.length) {
        const owned = await db.query<{ n: number }>(
          `select count(*)::int as n from files
           where id in (select (jsonb_array_elements_text($1::jsonb))::uuid)
             and uploader_id = $2 and channel_id = $3 and message_id is null`,
          [JSON.stringify(fileIds), user.id, id],
        );
        if (owned[0].n !== fileIds.length) throw new HttpError(400, 'Unknown or already attached file');
      }

      const rows = await db.query<{ id: string }>(
        'insert into messages (channel_id, user_id, parent_id, body) values ($1, $2, $3, $4) returning id',
        [id, user.id, body.parentId ?? null, body.body],
      );
      const messageId = rows[0].id;
      if (fileIds.length) {
        await db.query('update files set message_id = $1 where id in (select (jsonb_array_elements_text($2::jsonb))::uuid)', [
          messageId,
          JSON.stringify(fileIds),
        ]);
      }
      await saveMentions(db, messageId, access.workspace_id, body.body);

      const message = (await getMessage(db, files, messageId))!;
      await hub.toChannel(db, id, { type: 'message.created', message });
      if (body.parentId) {
        const parent = await getMessage(db, files, body.parentId);
        if (parent) await hub.toChannel(db, id, { type: 'message.updated', message: parent });
      }
      return message;
    },
  );
}
