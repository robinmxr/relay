import { createHash, randomBytes } from 'node:crypto';
import type { User } from '@relay/shared';
import type { Db } from './db';

export const SESSION_DAYS = 30;

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Only the hash is stored, so a leaked sessions table cannot be replayed. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function userFromToken(db: Db, token: string | undefined): Promise<User | null> {
  if (!token || token.length > 200) return null;
  const rows = await db.query<User>(
    `select u.id, u.email, u.name
     from sessions s join users u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > now()`,
    [hashToken(token)],
  );
  return rows[0] ?? null;
}

export async function createSession(db: Db, userId: string): Promise<string> {
  const token = newToken();
  await db.query(
    `insert into sessions (token_hash, user_id, expires_at)
     values ($1, $2, now() + make_interval(days => $3::int))`,
    [hashToken(token), userId, SESSION_DAYS],
  );
  return token;
}

export function bearer(header: string | undefined): string | undefined {
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}
