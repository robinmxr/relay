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

type Db = Ctx['db'];

/** After commit: what to tell the channel. */
type Outcome = { type: 'updated'; id: string } | { type: 'deleted'; id: string; parentId: string | null };

export function messageRoutes(app: FastifyInstance, ctx: Ctx): void {
  const { db, hub, files } = ctx;

  /** The message and its counts. With `lock`, inside a transaction, holds its row until commit. */
  async function meta(q: Db, id: string, lock = false): Promise<MessageMeta> {
    // Lock first, count after, in two statements. Under READ COMMITTED a statement that waits for
    // a lock still reads with the snapshot from before the wait, so a single `select ... for update`
    // would miss a reply committed while it waited, and the delete would cascade that reply away.
    if (lock) await q.query('select 1 from messages where id = $1 for update', [id]);
    const rows = await q.query<MessageMeta>(
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

  async function publish(channelId: string, outcomes: Outcome[]) {
    for (const o of outcomes) {
      if (o.type === 'updated') await publishUpdated(channelId, o.id);
      else await hub.toChannel(db, channelId, { type: 'message.deleted', id: o.id, channelId, parentId: o.parentId });
    }
  }

  app.get('/api/messages/:id/replies', async (req) => {
    const user = me(req);
    const { id } = parse(idParams, req.params);
    const m = await meta(db, id);
    await requireChannel(db, m.channel_id, user.id);
    return listReplies(db, files, id);
  });

  app.patch('/api/messages/:id', async (req) => {
    const user = me(req);
    const { id } = parse(idParams, req.params);
    const { body } = parse(z.object({ body: z.string().trim().max(LIMITS.messageBody) }), req.body);
    const { channel_id } = await meta(db, id);
    const access = await requireChannel(db, channel_id, user.id, { member: true });
    if (access.archived_at) throw new HttpError(403, 'This channel is archived');
    await db.tx(async (q) => {
      // Checked under the row lock so a concurrent delete cannot slip in between.
      const m = await meta(q, id, true);
      if (m.user_id !== user.id) throw new HttpError(403, 'You can only edit your own messages');
      if (m.deleted_at) throw new HttpError(400, 'Message was deleted');
      if (!body && m.files === 0) throw new HttpError(400, 'A message needs text or a file');
      await q.query('update messages set body = $2, edited_at = now() where id = $1', [id, body]);
      await saveMentions(q, id, access.workspace_id, body);
    });
    return publishUpdated(channel_id, id);
  });

  // A message with replies becomes a "deleted" placeholder so its thread survives; others are removed.
  app.delete('/api/messages/:id', async (req) => {
    const user = me(req);
    const { id } = parse(idParams, req.params);
    const { channel_id } = await meta(db, id);
    const access = await requireChannel(db, channel_id, user.id, { member: true });
    if (access.archived_at) throw new HttpError(403, 'This channel is archived');

    const { keys, outcomes } = await db.tx(async (q) => {
      const m = await meta(q, id, true);
      if (m.user_id !== user.id) throw new HttpError(403, 'You can only delete your own messages');
      // Locks the parent too, as posting a reply does, so a new reply and this check cannot interleave.
      const parent = m.parent_id ? await meta(q, m.parent_id, true) : null;
      const keys = await q.query<{ storage_key: string }>(
        'select storage_key from files where message_id = $1 or message_id in (select id from messages where parent_id = $1)',
        [id],
      );
      const outcomes: Outcome[] = [];
      if (m.replies > 0) {
        if (!m.deleted_at) {
          await q.query("update messages set deleted_at = now(), body = '' where id = $1", [id]);
          await q.query('delete from files where message_id = $1', [id]);
          await q.query('delete from reactions where message_id = $1', [id]);
          await q.query('delete from message_mentions where message_id = $1', [id]);
          outcomes.push({ type: 'updated', id });
        }
      } else {
        await q.query('delete from messages where id = $1', [id]);
        outcomes.push({ type: 'deleted', id, parentId: m.parent_id });
        if (parent) {
          if (parent.deleted_at && parent.replies <= 1) {
            // The last reply under a deleted message is gone, so the placeholder goes too.
            await q.query('delete from messages where id = $1', [parent.id]);
            outcomes.push({ type: 'deleted', id: parent.id, parentId: null });
          } else {
            outcomes.push({ type: 'updated', id: parent.id });
          }
        }
      }
      return { keys, outcomes };
    });

    await publish(channel_id, outcomes);
    // Blobs go only after the rows are gone for good; a failure here leaves an orphan file, never a dangling row.
    await Promise.all(keys.map((k) => files.remove(k.storage_key)));
    return { ok: true };
  });

  // Toggles the viewer's reaction.
  app.post('/api/messages/:id/reactions', async (req) => {
    const user = me(req);
    const { id } = parse(idParams, req.params);
    const { emoji } = parse(z.object({ emoji: z.string().trim().min(1).max(32) }), req.body);
    const { channel_id } = await meta(db, id);
    const access = await requireChannel(db, channel_id, user.id, { member: true });
    if (access.archived_at) throw new HttpError(403, 'This channel is archived');
    await db.tx(async (q) => {
      // Locked so a reaction cannot land on a message that is becoming a deleted placeholder.
      const m = await meta(q, id, true);
      if (m.deleted_at) throw new HttpError(400, 'Message was deleted');
      const removed = await q.query('delete from reactions where message_id = $1 and user_id = $2 and emoji = $3 returning 1', [
        id,
        user.id,
        emoji,
      ]);
      if (!removed.length) {
        await q.query('insert into reactions (message_id, user_id, emoji) values ($1, $2, $3) on conflict do nothing', [id, user.id, emoji]);
      }
    });
    return publishUpdated(channel_id, id);
  });
}
