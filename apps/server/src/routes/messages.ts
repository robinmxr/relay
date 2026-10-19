import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LIMITS } from '@relay/shared';
import type { Ctx } from '../context';
import { HttpError, parse } from '../errors';
import { saveMentions } from '../mentions';
import { getMessage, listReplies, requireChannel } from '../queries';
import { idParams, me } from './util';

interface MessageMeta {
  id: string;
  channel_id: string;
  parent_id: string | null;
  user_id: string;
  deleted_at: Date | null;
  replies: number;
  files: number;
}

export function messageRoutes(app: FastifyInstance, ctx: Ctx): void {
  const { db, hub, files } = ctx;

  async function meta(id: string): Promise<MessageMeta> {
    const rows = await db.query<MessageMeta>(
      `select m.id, m.channel_id, m.parent_id, m.user_id, m.deleted_at,
         (select count(*)::int from messages r where r.parent_id = m.id) as replies,
         (select count(*)::int from files f where f.message_id = m.id) as files
       from messages m where m.id = $1`,
      [id],
    );
    if (!rows[0]) throw new HttpError(404, 'Message not found');
    return rows[0];
  }

  async function publishUpdated(channelId: string, id: string) {
    const message = await getMessage(db, files, id);
    if (message) await hub.toChannel(db, channelId, { type: 'message.updated', message });
    return message;
  }

  app.get('/api/messages/:id/replies', async (req) => {
    const user = me(req);
    const { id } = parse(idParams, req.params);
    const m = await meta(id);
    await requireChannel(db, m.channel_id, user.id);
    return listReplies(db, files, id);
  });

  app.patch('/api/messages/:id', async (req) => {
    const user = me(req);
    const { id } = parse(idParams, req.params);
    const { body } = parse(z.object({ body: z.string().trim().max(LIMITS.messageBody) }), req.body);
    const m = await meta(id);
    const access = await requireChannel(db, m.channel_id, user.id, { member: true });
    if (m.user_id !== user.id) throw new HttpError(403, 'You can only edit your own messages');
    if (m.deleted_at) throw new HttpError(400, 'Message was deleted');
    if (!body && m.files === 0) throw new HttpError(400, 'A message needs text or a file');
    await db.query('update messages set body = $2, edited_at = now() where id = $1', [id, body]);
    await saveMentions(db, id, access.workspace_id, body);
    return publishUpdated(m.channel_id, id);
  });

  // A message with replies becomes a "deleted" placeholder so its thread survives; others are removed.
  app.delete('/api/messages/:id', async (req) => {
    const user = me(req);
    const { id } = parse(idParams, req.params);
    const m = await meta(id);
    await requireChannel(db, m.channel_id, user.id, { member: true });
    if (m.user_id !== user.id) throw new HttpError(403, 'You can only delete your own messages');

    const keys = await db.query<{ storage_key: string }>(
      'select storage_key from files where message_id = $1 or message_id in (select id from messages where parent_id = $1)',
      [id],
    );

    if (m.replies > 0) {
      await db.query("update messages set deleted_at = now(), body = '' where id = $1", [id]);
      await db.query('delete from files where message_id = $1', [id]);
      await db.query('delete from reactions where message_id = $1', [id]);
      await db.query('delete from message_mentions where message_id = $1', [id]);
      await publishUpdated(m.channel_id, id);
    } else {
      await db.query('delete from messages where id = $1', [id]);
      await hub.toChannel(db, m.channel_id, { type: 'message.deleted', id, channelId: m.channel_id, parentId: m.parent_id });
      if (m.parent_id) {
        const parent = await meta(m.parent_id);
        if (parent.deleted_at && parent.replies === 0) {
          // The last reply under a deleted message is gone, so the placeholder goes too.
          await db.query('delete from messages where id = $1', [parent.id]);
          await hub.toChannel(db, m.channel_id, { type: 'message.deleted', id: parent.id, channelId: m.channel_id, parentId: null });
        } else {
          await publishUpdated(m.channel_id, m.parent_id);
        }
      }
    }

    await Promise.all(keys.map((k) => files.remove(k.storage_key)));
    return { ok: true };
  });

  // Toggles the viewer's reaction.
  app.post('/api/messages/:id/reactions', async (req) => {
    const user = me(req);
    const { id } = parse(idParams, req.params);
    const { emoji } = parse(z.object({ emoji: z.string().trim().min(1).max(32) }), req.body);
    const m = await meta(id);
    await requireChannel(db, m.channel_id, user.id, { member: true });
    if (m.deleted_at) throw new HttpError(400, 'Message was deleted');
    const removed = await db.query(
      'delete from reactions where message_id = $1 and user_id = $2 and emoji = $3 returning 1',
      [id, user.id, emoji],
    );
    if (!removed.length) {
      await db.query(
        'insert into reactions (message_id, user_id, emoji) values ($1, $2, $3) on conflict do nothing',
        [id, user.id, emoji],
      );
    }
    return publishUpdated(m.channel_id, id);
  });
}
