import { MENTION_RE } from '@relay/shared';
import type { Db } from './db';

export function extractMentions(body: string): string[] {
  return [...new Set([...body.matchAll(MENTION_RE)].map((m) => m[1].toLowerCase()))];
}

/** Replaces a message's mentions with the ids in its body that belong to the workspace. */
export async function saveMentions(db: Db, messageId: string, workspaceId: string, body: string): Promise<string[]> {
  await db.query('delete from message_mentions where message_id = $1', [messageId]);
  const ids = extractMentions(body);
  if (ids.length === 0) return [];
  const rows = await db.query<{ user_id: string }>(
    `insert into message_mentions (message_id, user_id)
     select $1, w.user_id from workspace_members w
     where w.workspace_id = $2 and w.user_id in (select (jsonb_array_elements_text($3::jsonb))::uuid)
     on conflict do nothing
     returning user_id`,
    [messageId, workspaceId, JSON.stringify(ids)],
  );
  return rows.map((r) => r.user_id);
}
