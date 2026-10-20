import type { User, UserStatus } from '@relay/shared';
import type { Db } from './db';
import type { Hub } from './hub';
import type { FileStore } from './files';

/** The user columns every User-bearing query needs. Always aliased to `u`. */
export const USER_COLUMNS = 'u.id, u.email, u.name, u.avatar_key, u.avatar_updated_at, u.status_emoji, u.status_text, u.status_expires_at';

export interface UserRow {
  id: string;
  email: string;
  name: string;
  avatar_key: string | null;
  avatar_updated_at: Date | string | null;
  status_emoji: string | null;
  status_text: string | null;
  status_expires_at: Date | string | null;
}

/** A User for the wire: a signed avatar URL, and a status that has expired treated as unset. */
export function toUser(files: FileStore, r: UserRow): User {
  const expires = r.status_expires_at ? new Date(r.status_expires_at) : null;
  const status: UserStatus | null =
    r.status_emoji && (!expires || expires.getTime() > Date.now())
      ? { emoji: r.status_emoji, text: r.status_text ?? '', expiresAt: expires ? expires.toISOString() : null }
      : null;
  return { id: r.id, email: r.email, name: r.name, avatarUrl: r.avatar_key ? files.avatarUrl(r.id, r.avatar_updated_at) : null, status };
}

/** Lets every open client refresh its member list after a profile or status change. */
export async function announceProfileChange(db: Db, hub: Hub, userId: string): Promise<void> {
  const rows = await db.query<{ workspace_id: string }>('select workspace_id from workspace_members where user_id = $1', [userId]);
  for (const r of rows) {
    await hub.toWorkspace(db, r.workspace_id, { type: 'members.changed', workspaceId: r.workspace_id });
  }
}
