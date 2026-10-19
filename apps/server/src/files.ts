import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { IMAGE_MIME_TYPES, type FileInfo } from '@relay/shared';
import type { Db } from './db';

const DAY_S = 86_400;

/**
 * Stores uploads on local disk under `dir` and signs download URLs. Signed URLs let the client use
 * plain <img src> without an auth header. They expire one to two days out, rounded to the day,
 * so a file's URL stays the same (and cacheable) for a day.
 */
export class FileStore {
  private constructor(
    private dir: string,
    private secret: Buffer,
  ) {}

  static async open(db: Db, dir: string): Promise<FileStore> {
    await mkdir(dir, { recursive: true });
    await db.query(`insert into settings (key, value) values ('file_secret', $1) on conflict (key) do nothing`, [
      randomBytes(32).toString('hex'),
    ]);
    const [row] = await db.query<{ value: string }>(`select value from settings where key = 'file_secret'`);
    return new FileStore(path.resolve(dir), Buffer.from(row.value, 'hex'));
  }

  url(id: string): string {
    const exp = (Math.floor(Date.now() / 1000 / DAY_S) + 2) * DAY_S;
    return `/api/files/${id}?exp=${exp}&sig=${this.sign(id, exp)}`;
  }

  verify(id: string, exp: number, sig: string): boolean {
    if (!Number.isInteger(exp) || exp * 1000 < Date.now()) return false;
    const expected = Buffer.from(this.sign(id, exp));
    const given = Buffer.from(sig);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  info(row: { id: string; name: string; mime: string; size: number | string }): FileInfo {
    return { id: row.id, name: row.name, mime: row.mime, size: Number(row.size), url: this.url(row.id), isImage: isImage(row.mime) };
  }

  /** Writes the stream; on failure the partial file is removed and the error rethrown. Returns the size. */
  async save(key: string, stream: Readable): Promise<number> {
    const file = this.path(key);
    try {
      await pipeline(stream, createWriteStream(file, { flags: 'wx' }));
      return (await stat(file)).size;
    } catch (err) {
      await this.remove(key);
      throw err;
    }
  }

  read(key: string): Readable {
    return createReadStream(this.path(key));
  }

  async remove(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }

  private path(key: string): string {
    if (!/^[0-9a-f-]{36}$/.test(key)) throw new Error('Bad storage key');
    return path.join(this.dir, key);
  }

  private sign(id: string, exp: number): string {
    return createHmac('sha256', this.secret).update(`${id}.${exp}`).digest('base64url');
  }
}

export function isImage(mime: string): boolean {
  return (IMAGE_MIME_TYPES as readonly string[]).includes(mime);
}

export function cleanFileName(name: string | undefined): string {
  const base = (name ?? '').split(/[\\/]/).pop() ?? '';
  const cleaned = base.replace(/[\u0000-\u001f\u007f"]/g, '').trim().slice(0, 200);
  return cleaned || 'file';
}

export function cleanMime(mime: string | undefined): string {
  return mime && /^[\w.+-]+\/[\w.+-]+$/.test(mime) ? mime.toLowerCase() : 'application/octet-stream';
}
