import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LIMITS, type UserWithPresence } from '@relay/shared';
import type { Ctx } from '../context';
import { HttpError, parse } from '../errors';
import { saveMentions } from '../mentions';
import { channelMemberIds, getMessage, listMessages, requireChannel } from '../queries';
import { toUser, USER_COLUMNS, type UserRow } from '../users';
import { idParams, me, rateKey, uuid } from './util';

const postMessageBody = z
  .object({
    body: z.string().trim().max(LIMITS.messageBody).default(''),
    parentId: uuid.optional(),
    fileIds: z.array(uuid).max(LIMITS.filesPerMessage).default([]),
  })
  .refine((b) => b.body.length > 0 || b.fileIds.length > 0, { message: 'a message needs text or a file', path: ['body'] });

const channelNameField = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9_-]{0,79}$/, 'use lowercase letters, numbers, - and _ (up to 80)');

export function channelRoutes(app: FastifyInstance, ctx: Ctx): void {
  const { db, hub, files } = ctx;

  /** Channels.changed reaches just the given people — for private channels and one-person events. */
  const channelsChanged = async (userIds: string[], workspaceId: string) => {
    await hub.publish({ to: [...new Set(userIds)], event: { type: 'channels.changed', workspaceId } });
  };

  /** Public channels change for the whole workspace (browse list); private ones only for members. */
  const announceChannel = async (channelId: string, access: { workspace_id: string; is_private: boolean }) => {
    const event = { type: 'channels.changed', workspaceId: access.workspace_id } as const;
    if (access.is_private) await hub.publish({ to: await channelMemberIds(db, channelId), event });
    else await hub.toWorkspace(db, access.workspace_id, event);
  };

  /** Members may write; archived channels are read-only. */
  const writable = (access: { archived_at: Date | string | null }) => {
    if (access.archived_at) throw new HttpError(403, 'This channel is archived');
  };

  app.post('/api/channels/:id/join', async (req) => {
    const user = me(req);
    const { id } = parse(idParams, req.params);
    const access = await requireChannel(db, id, user.id);
    if (access.is_private || access.is_dm) throw new HttpError(404, 'Channel not found');
    writable(access);
    await db.query('insert into channel_members (channel_id, user_id) values ($1, $2) on conflict do nothing', [id, user.id]);
    await channelsChanged([user.id], access.workspace_id);
    return { ok: true };
  });

  /** Renaming or retitling; any member of the channel may do it. Not for DMs. */
  app.patch('/api/channels/:id', async (req) => {
    const user = me(req);
    const { id } = parse(idParams, req.params);
    const body = parse(z.object({ name: channelNameField.optional(), topic: z.string().trim().max(LIMITS.topic).optional() }), req.body ?? {});
    const access = await requireChannel(db, id, user.id, { member: true });
    if (access.is_dm) throw new HttpError(400, 'Direct messages cannot be renamed');
    if (body.name === undefined && body.topic === undefined) throw new HttpError(400, 'Nothing to update');
    if (body.name !== undefined) {
      const clash = await db.query('select 1 from channels where workspace_id = $1 and lower(name) = $2 and id <> $3', [
        access.workspace_id,
        body.name,
        id,
      ]);
      if (clash.length) throw new HttpError(409, `#${body.name} already exists`);
    }
    const sets: string[] = [];
    const values: unknown[] = [id];
    if (body.name !== undefined) {
      values.push(body.name);
      sets.push(`name = $${values.length}`);
    }
    if (body.topic !== undefined) {
      values.push(body.topic);
      sets.push(`topic = $${values.length}`);
    }
    await db.query(`update channels set ${sets.join(', ')} where id = $1`, values);
    await announceChannel(id, access);
    return { ok: true };
  });

  /** Archive or restore. Archived channels stay readable but refuse messages, joins and huddles. */
  app.post('/api/channels/:id/archive', async (req) => {
    const user = me(req);
    const { id } = parse(idParams, req.params);
    const { archived } = parse(z.object({ archived: z.boolean() }), req.body);
    const access = await requireChannel(db, id, user.id, { member: true });
    if (access.is_dm) throw new HttpError(400, 'Direct messages cannot be archived');
    await db.query('update channels set archived_at = case when $2::boolean then now() else null end where id = $1', [id, archived]);
    await announceChannel(id, access);
    return { ok: true };
  });

  /** Members of the channel, for the settings panel. Private ones only reveal themselves to members (already enforced by requireChannel). */
  app.get('/api/channels/:id/members', async (req): Promise<UserWithPresence[]> => {
    const user = me(req);
    const { id } = parse(idParams, req.params);
    const access = await requireChannel(db, id, user.id);
    if (access.is_private && !access.is_member) throw new HttpError(404, 'Channel not found');
    const rows = await db.query<UserRow>(
      `select ${USER_COLUMNS} from users u
       join channel_members m on m.user_id = u.id
       where m.channel_id = $1
       order by lower(u.name)`,
      [id],
    );
    const online = await ctx.presence.online(rows.map((u) => u.id));
    return rows.map((u) => ({ ...toUser(files, u), online: online.has(u.id) }));
  });

  /** Adds someone to a private channel. Public channels use join; DMs take nobody new. */
  app.post('/api/channels/:id/members', async (req) => {
    const user = me(req);
    const { id } = parse(idParams, req.params);
    const { userId } = parse(z.object({ userId: uuid }), req.body);
    const access = await requireChannel(db, id, user.id, { member: true });
    if (access.is_dm) throw new HttpError(400, 'Direct messages have no invites');
    if (!access.is_private) throw new HttpError(400, 'Public channels are open — ask them to join');
    const added = await db.query('select 1 from workspace_members where workspace_id = $1 and user_id = $2', [access.workspace_id, userId]);
    if (!added.length) throw new HttpError(404, 'User not found');
    await db.query('insert into channel_members (channel_id, user_id) values ($1, $2) on conflict do nothing', [id, userId]);
    await channelsChanged([userId], access.workspace_id);
    return { ok: true };
  });

  /** Removes someone from a private channel; yourself with "me" to leave. */
  app.delete('/api/channels/:id/members/:uid', async (req) => {
    const user = me(req);
    const { id, uid } = parse(z.object({ id: uuid, uid: z.union([uuid, z.literal('me')]) }), req.params);
    const target = uid === 'me' ? user.id : uid;
    const access = await requireChannel(db, id, user.id, { member: true });
    if (access.is_dm) throw new HttpError(400, 'Direct messages cannot be left');
    // Leaving is always yours to do; removing someone else is for private channels.
    if (target !== user.id && !access.is_private) throw new HttpError(400, 'Public channels are open — anyone can leave');
    await db.query('delete from channel_members where channel_id = $1 and user_id = $2', [id, target]);
    await channelsChanged([target], access.workspace_id);
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
      writable(access);

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
