import type { Channel, Message, MessagePage, User, Workspace } from '@relay/shared';
import type { Db } from './db';
import { HttpError } from './errors';
import type { FileStore } from './files';
import type { Huddles } from './huddles';
import { toUser, type UserRow } from './users';

const MESSAGE_SELECT = `
  select m.id, m.channel_id, m.parent_id, m.body, m.created_at, m.edited_at, m.deleted_at,
    json_build_object('id', u.id, 'email', u.email, 'name', u.name,
      'avatarKey', u.avatar_key, 'avatarUpdatedAt', u.avatar_updated_at, 'statusEmoji', u.status_emoji,
      'statusText', u.status_text, 'statusExpires', u.status_expires_at) as author,
    (select count(*)::int from messages r where r.parent_id = m.id) as reply_count,
    (select max(r.created_at) from messages r where r.parent_id = m.id) as last_reply_at,
    coalesce((
      select json_agg(json_build_object('emoji', g.emoji, 'userIds', g.user_ids) order by g.first_at)
      from (
        select x.emoji, json_agg(x.user_id order by x.created_at) as user_ids, min(x.created_at) as first_at
        from reactions x
        where x.message_id = m.id
        group by x.emoji
      ) g
    ), '[]'::json) as reactions,
    coalesce((select json_agg(mm.user_id) from message_mentions mm where mm.message_id = m.id), '[]'::json) as mentions,
    coalesce((
      select json_agg(json_build_object('id', f.id, 'name', f.name, 'mime', f.mime, 'size', f.size) order by f.created_at)
      from files f
      where f.message_id = m.id
    ), '[]'::json) as files
  from messages m
  join users u on u.id = m.user_id`;

interface MessageRow {
  id: string;
  channel_id: string;
  parent_id: string | null;
  body: string;
  created_at: Date | string;
  edited_at: Date | string | null;
  deleted_at: Date | string | null;
  author: UserRow;
  reply_count: number;
  last_reply_at: Date | string | null;
  reactions: { emoji: string; userIds: string[] }[];
  mentions: string[];
  files: { id: string; name: string; mime: string; size: number }[];
}

const iso = (v: Date | string) => new Date(v).toISOString();

function toMessage(r: MessageRow, files: FileStore): Message {
  const deleted = r.deleted_at !== null;
  return {
    id: r.id,
    channelId: r.channel_id,
    parentId: r.parent_id,
    user: toUser(files, r.author),
    body: deleted ? '' : r.body,
    createdAt: iso(r.created_at),
    editedAt: r.edited_at ? iso(r.edited_at) : null,
    deleted,
    replyCount: r.reply_count,
    lastReplyAt: r.last_reply_at ? iso(r.last_reply_at) : null,
    reactions: deleted ? [] : r.reactions,
    mentions: deleted ? [] : r.mentions,
    files: deleted ? [] : r.files.map((f) => files.info(f)),
  };
}

export async function getMessage(db: Db, files: FileStore, id: string): Promise<Message | null> {
  const rows = await db.query<MessageRow>(`${MESSAGE_SELECT} where m.id = $1`, [id]);
  return rows[0] ? toMessage(rows[0], files) : null;
}

/** Newest `limit` top-level messages before `before`, returned oldest first. */
export async function listMessages(db: Db, files: FileStore, channelId: string, before: string | null, limit: number): Promise<MessagePage> {
  const rows = await db.query<MessageRow>(
    `${MESSAGE_SELECT}
     where m.channel_id = $1 and m.parent_id is null
       and (m.deleted_at is null or exists (select 1 from messages r where r.parent_id = m.id))
       and ($2::timestamptz is null or m.created_at < $2::timestamptz)
     order by m.created_at desc, m.id desc
     limit $3`,
    [channelId, before, limit + 1],
  );
  return { messages: rows.slice(0, limit).reverse().map((r) => toMessage(r, files)), hasMore: rows.length > limit };
}

export async function listReplies(db: Db, files: FileStore, parentId: string): Promise<Message[]> {
  const rows = await db.query<MessageRow>(`${MESSAGE_SELECT} where m.parent_id = $1 order by m.created_at, m.id`, [parentId]);
  return rows.map((r) => toMessage(r, files));
}

/** Prefix match on every word: "deplo fri" finds "deploy on Friday". */
export function toPrefixQuery(q: string): string | null {
  const words = (q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 8);
  return words.length ? words.map((w) => `${w}:*`).join(' & ') : null;
}

/** Messages in the workspace's channels that the user belongs to, newest first. */
export async function searchMessages(db: Db, files: FileStore, userId: string, workspaceId: string, q: string): Promise<Message[]> {
  const query = toPrefixQuery(q);
  if (!query) return [];
  const rows = await db.query<MessageRow>(
    `${MESSAGE_SELECT}
     join channels c on c.id = m.channel_id
     join channel_members cm on cm.channel_id = c.id and cm.user_id = $2
     where c.workspace_id = $3 and m.deleted_at is null
       and to_tsvector('simple', m.body) @@ to_tsquery('simple', $1)
     order by m.created_at desc
     limit 50`,
    [query, userId, workspaceId],
  );
  return rows.map((r) => toMessage(r, files));
}

interface ChannelRow {
  id: string;
  workspace_id: string;
  name: string;
  topic: string;
  is_private: boolean;
  is_dm: boolean;
  is_member: boolean;
  unread: number;
  mentions: number;
  archived_at: Date | string | null;
  dm_user: UserRow | null;
}

/** Channels in the workspace the user belongs to, plus public ones they can join. */
export async function listChannels(db: Db, huddles: Huddles, files: FileStore, me: User, workspaceId: string): Promise<Channel[]> {
  const rows = await db.query<ChannelRow>(
    `select c.id, c.workspace_id, c.name, c.topic, c.is_private, c.is_dm, c.archived_at,
       (m.user_id is not null) as is_member,
       case when m.user_id is null then 0 else (
         select count(*)::int from messages x
         where x.channel_id = c.id and x.parent_id is null and x.deleted_at is null
           and x.user_id <> $1 and x.created_at > m.last_read_at
       ) end as unread,
       case when m.user_id is null then 0 else (
         select count(*)::int from message_mentions mm join messages x on x.id = mm.message_id
         where mm.user_id = $1 and x.channel_id = c.id and x.deleted_at is null
           and x.user_id <> $1 and x.created_at > m.last_read_at
       ) end as mentions,
       case when c.is_dm then (
         select json_build_object('id', u.id, 'email', u.email, 'name', u.name,
           'avatarKey', u.avatar_key, 'avatarUpdatedAt', u.avatar_updated_at, 'statusEmoji', u.status_emoji,
           'statusText', u.status_text, 'statusExpires', u.status_expires_at)
         from channel_members o join users u on u.id = o.user_id
         where o.channel_id = c.id and o.user_id <> $1
         limit 1
       ) end as dm_user
     from channels c
     left join channel_members m on m.channel_id = c.id and m.user_id = $1
     where c.workspace_id = $2 and ((not c.is_private and not c.is_dm) or m.user_id is not null)
     order by c.is_dm, c.name`,
    [me.id, workspaceId],
  );
  return rows.map((r) => ({
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    topic: r.topic,
    isPrivate: r.is_private,
    isDm: r.is_dm,
    isMember: r.is_member,
    unread: r.unread,
    mentions: r.mentions,
    dmUser: r.is_dm ? (r.dm_user ? toUser(files, r.dm_user) : me) : null,
    huddle: r.is_member ? huddles.participants(r.id) : [],
    archivedAt: r.archived_at ? iso(r.archived_at) : null,
  }));
}

export interface ChannelAccess {
  workspace_id: string;
  is_private: boolean;
  is_dm: boolean;
  is_member: boolean;
  archived_at: Date | string | null;
}

/** The channel if the user may see it (workspace member, and channel member or public), else null. */
export async function channelAccess(db: Db, channelId: string, userId: string): Promise<ChannelAccess | null> {
  const rows = await db.query<ChannelAccess & { in_workspace: boolean }>(
    `select c.workspace_id, c.is_private, c.is_dm, c.archived_at,
       exists (select 1 from channel_members m where m.channel_id = c.id and m.user_id = $2) as is_member,
       exists (select 1 from workspace_members w where w.workspace_id = c.workspace_id and w.user_id = $2) as in_workspace
     from channels c
     where c.id = $1`,
    [channelId, userId],
  );
  const row = rows[0];
  if (!row || !row.in_workspace) return null;
  if (!row.is_member && (row.is_private || row.is_dm)) return null;
  return {
    workspace_id: row.workspace_id,
    is_private: row.is_private,
    is_dm: row.is_dm,
    is_member: row.is_member,
    archived_at: row.archived_at,
  };
}

export async function requireChannel(db: Db, channelId: string, userId: string, opts: { member?: boolean } = {}): Promise<ChannelAccess> {
  const access = await channelAccess(db, channelId, userId);
  if (!access) throw new HttpError(404, 'Channel not found');
  if (opts.member && !access.is_member) throw new HttpError(403, 'Join the channel first');
  return access;
}

export async function requireWorkspace(db: Db, workspaceId: string, userId: string): Promise<'owner' | 'member'> {
  const rows = await db.query<{ role: 'owner' | 'member' }>(
    'select role from workspace_members where workspace_id = $1 and user_id = $2',
    [workspaceId, userId],
  );
  if (!rows[0]) throw new HttpError(404, 'Workspace not found');
  return rows[0].role;
}

export async function listWorkspaces(db: Db, userId: string): Promise<Workspace[]> {
  const rows = await db.query<{ id: string; name: string; role: 'owner' | 'member'; join_code: string }>(
    `select w.id, w.name, m.role, w.join_code
     from workspaces w join workspace_members m on m.workspace_id = w.id
     where m.user_id = $1
     order by m.joined_at, w.created_at`,
    [userId],
  );
  return rows.map((r) => ({ id: r.id, name: r.name, role: r.role, joinCode: r.join_code }));
}

export async function channelMemberIds(db: Db, channelId: string): Promise<string[]> {
  const rows = await db.query<{ user_id: string }>('select user_id from channel_members where channel_id = $1', [channelId]);
  return rows.map((r) => r.user_id);
}

export async function workspaceMemberIds(db: Db, workspaceId: string): Promise<string[]> {
  const rows = await db.query<{ user_id: string }>('select user_id from workspace_members where workspace_id = $1', [workspaceId]);
  return rows.map((r) => r.user_id);
}

/** Everyone who shares at least one workspace with the user (including the user). */
export async function coworkerIds(db: Db, userId: string): Promise<string[]> {
  const rows = await db.query<{ user_id: string }>(
    `select distinct b.user_id from workspace_members a
     join workspace_members b on b.workspace_id = a.workspace_id
     where a.user_id = $1`,
    [userId],
  );
  return rows.map((r) => r.user_id);
}

/** Joins a workspace and its #general and #random. */
export async function joinWorkspace(db: Db, workspaceId: string, userId: string, role: 'owner' | 'member' = 'member'): Promise<void> {
  await db.query(
    'insert into workspace_members (workspace_id, user_id, role) values ($1, $2, $3) on conflict do nothing',
    [workspaceId, userId, role],
  );
  await db.query(
    `insert into channel_members (channel_id, user_id)
     select id, $2 from channels
     where workspace_id = $1 and not is_dm and not is_private and lower(name) in ('general', 'random')
     on conflict do nothing`,
    [workspaceId, userId],
  );
}
