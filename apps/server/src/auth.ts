import { createHash, randomBytes } from 'node:crypto';
import type { User } from '@relay/shared';
import type { Db } from './db';
import type { FileStore } from './files';
import { toUser, USER_COLUMNS, type UserRow } from './users';

export const SESSION_DAYS = 30;

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Only the hash is stored, so a leaked sessions table cannot be replayed. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function userFromToken(db: Db, files: FileStore, token: string | undefined): Promise<User | null> {
  if (!token || token.length > 200) return null;
  const rows = await db.query<UserRow>(
    `select ${USER_COLUMNS}
     from sessions s join users u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > now()`,
    [hashToken(token)],
  );
  return rows[0] ? toUser(files, rows[0]) : null;
}

export async function createSession(db: Db, userId: string, userAgent?: string): Promise<string> {
  const token = newToken();
  await db.query(
    `insert into sessions (token_hash, user_id, user_agent, expires_at)
     values ($1, $2, $3, now() + make_interval(days => $4::int))`,
    [hashToken(token), userId, userAgent ?? null, SESSION_DAYS],
  );
  return token;
}

/** Used after a password change or recovery: every other device has to sign in again. */
export async function revokeOtherSessions(db: Db, userId: string, keepToken: string | undefined): Promise<void> {
  await db.query('delete from sessions where user_id = $1 and token_hash <> $2', [userId, keepToken ? hashToken(keepToken) : '']);
}

export function bearer(header: string | undefined): string | undefined {
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}
