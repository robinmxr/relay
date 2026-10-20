import { randomInt } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LIMITS, type UserWithPresence, type Workspace } from '@relay/shared';
import type { Ctx } from '../context';
import { createDefaultChannels } from '../db';
import { HttpError, parse } from '../errors';
import { hashPassword, newTempPassword } from '../password';
import { joinWorkspace, listChannels, listWorkspaces, requireWorkspace, searchMessages } from '../queries';
import { toUser, USER_COLUMNS, type UserRow } from '../users';
import { me, uuid, workspaceParams } from './util';

const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

function newJoinCode(): string {
  let code = '';
  for (let i = 0; i < 10; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

const createChannelBody = z.object({
  name: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9_-]{0,79}$/, 'use lowercase letters, numbers, - and _ (up to 80)'),
  topic: z.string().trim().max(LIMITS.topic).default(''),
  isPrivate: z.boolean().default(false),
});

export function workspaceRoutes(app: FastifyInstance, ctx: Ctx): void {
  const { db, hub } = ctx;

  app.get('/api/workspaces', async (req) => listWorkspaces(db, me(req).id));

  app.post('/api/workspaces', async (req): Promise<Workspace> => {
    const user = me(req);
    const { name } = parse(z.object({ name: z.string().trim().min(1).max(80) }), req.body);
    const rows = await db.query<{ id: string; join_code: string }>(
      'insert into workspaces (name, join_code, created_by) values ($1, $2, $3) returning id, join_code',
      [name, newJoinCode(), user.id],
    );
    const ws = rows[0];
    await createDefaultChannels(db, ws.id, [['general', `Everything ${name}`]]);
    await joinWorkspace(db, ws.id, user.id, 'owner');
    await hub.publish({ to: [user.id], event: { type: 'workspaces.changed' } });
    return { id: ws.id, name, role: 'owner', joinCode: ws.join_code };
  });

  app.post('/api/workspaces/join', async (req): Promise<Workspace> => {
    const user = me(req);
    const { code } = parse(z.object({ code: z.string().trim().toLowerCase().min(1).max(40) }), req.body);
    const rows = await db.query<{ id: string; name: string; join_code: string }>(
      'select id, name, join_code from workspaces where join_code = $1',
      [code],
    );
    const ws = rows[0];
    if (!ws) throw new HttpError(404, 'No workspace has that invite code');
    await joinWorkspace(db, ws.id, user.id);
    await hub.publish({ to: [user.id], event: { type: 'workspaces.changed' } });
    await hub.toWorkspace(db, ws.id, { type: 'members.changed', workspaceId: ws.id }, user.id);
    return { id: ws.id, name: ws.name, role: await requireWorkspace(db, ws.id, user.id), joinCode: ws.join_code };
  });

  /** Renames the workspace; the rail and headers update for everyone. Owner only. */
  app.patch('/api/workspaces/:wid', async (req) => {
    const user = me(req);
    const { wid } = parse(workspaceParams, req.params);
    const { name } = parse(z.object({ name: z.string().trim().min(1).max(80) }), req.body);
    if ((await requireWorkspace(db, wid, user.id)) !== 'owner') throw new HttpError(403, 'Only the workspace owner can rename it');
    await db.query('update workspaces set name = $2 where id = $1', [wid, name]);
    await hub.toWorkspace(db, wid, { type: 'workspaces.changed' });
    return { ok: true };
  });

  app.get('/api/workspaces/:wid/channels', async (req) => {
    const user = me(req);
    const { wid } = parse(workspaceParams, req.params);
    await requireWorkspace(db, wid, user.id);
    return listChannels(db, ctx.huddles, ctx.files, user, wid);
  });

  app.post('/api/workspaces/:wid/channels', async (req) => {
    const user = me(req);
    const { wid } = parse(workspaceParams, req.params);
    await requireWorkspace(db, wid, user.id);
    const body = parse(createChannelBody, req.body);
    let id: string;
    try {
      const rows = await db.query<{ id: string }>(
        'insert into channels (workspace_id, name, topic, is_private, created_by) values ($1, $2, $3, $4, $5) returning id',
        [wid, body.name, body.topic, body.isPrivate, user.id],
      );
      id = rows[0].id;
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw new HttpError(409, `#${body.name} already exists`);
      throw err;
    }
    await db.query('insert into channel_members (channel_id, user_id) values ($1, $2)', [id, user.id]);
    const event = { type: 'channels.changed', workspaceId: wid } as const;
    if (body.isPrivate) await hub.publish({ to: [user.id], event });
    else await hub.toWorkspace(db, wid, event);
    return { id };
  });

  /** Everyone in the workspace, with presence and role — powers the People panel. */
  app.get('/api/workspaces/:wid/users', async (req): Promise<UserWithPresence[]> => {
    const user = me(req);
    const { wid } = parse(workspaceParams, req.params);
    await requireWorkspace(db, wid, user.id);
    const rows = await db.query<UserRow & { role: 'owner' | 'member' }>(
      `select ${USER_COLUMNS}, w.role from users u
       join workspace_members w on w.user_id = u.id
       where w.workspace_id = $1
       order by lower(u.name)`,
      [wid],
    );
    const online = await ctx.presence.online(rows.map((u) => u.id));
    return rows.map((u) => ({ ...toUser(ctx.files, u), online: online.has(u.id), role: u.role }));
  });

  /** Kicks a member out of the workspace and its channels. Owner only; owners cannot be kicked. */
  app.delete('/api/workspaces/:wid/members/:uid', async (req) => {
    const user = me(req);
    const { wid, uid } = parse(z.object({ wid: uuid, uid: uuid }), req.params);
    if ((await requireWorkspace(db, wid, user.id)) !== 'owner') throw new HttpError(403, 'Only the workspace owner can remove people');
    if (uid === user.id) throw new HttpError(400, 'You cannot remove yourself');
    const target = await db.query<{ role: 'owner' | 'member' }>('select role from workspace_members where workspace_id = $1 and user_id = $2', [wid, uid]);
    if (!target.length) throw new HttpError(404, 'User not found');
    if (target[0].role === 'owner') throw new HttpError(403, 'The workspace owner cannot be removed');
    await db.query('delete from workspace_members where workspace_id = $1 and user_id = $2', [wid, uid]);
    await db.query('delete from channel_members where user_id = $2 and channel_id in (select id from channels where workspace_id = $1)', [wid, uid]);
    await hub.publish({ to: [uid], event: { type: 'workspaces.changed' } });
    await hub.toWorkspace(db, wid, { type: 'members.changed', workspaceId: wid });
    return { ok: true };
  });

  /**
   * The no-email password reset: the owner gets a one-time password to hand over.
   * Sign-in forces the member to replace it, their sessions die, and their old
   * recovery code stops working.
   */
  app.post('/api/workspaces/:wid/members/:uid/reset-password', async (req): Promise<{ tempPassword: string }> => {
    const user = me(req);
    const { wid, uid } = parse(z.object({ wid: uuid, uid: uuid }), req.params);
    if ((await requireWorkspace(db, wid, user.id)) !== 'owner') throw new HttpError(403, 'Only the workspace owner can reset passwords');
    const target = await db.query('select 1 from workspace_members where workspace_id = $1 and user_id = $2', [wid, uid]);
    if (!target.length) throw new HttpError(404, 'User not found');
    const tempPassword = newTempPassword();
    await db.query('update users set password_hash = $2, recovery_hash = null, must_change = true where id = $1', [
      uid,
      await hashPassword(tempPassword),
    ]);
    await db.query('delete from sessions where user_id = $1', [uid]);
    await hub.publish({ to: [uid], event: { type: 'workspaces.changed' } });
    return { tempPassword };
  });

  app.post('/api/workspaces/:wid/dms', async (req) => {
    const user = me(req);
    const { wid } = parse(workspaceParams, req.params);
    await requireWorkspace(db, wid, user.id);
    const { userId } = parse(z.object({ userId: uuid }), req.body);
    const other = await db.query('select 1 from workspace_members where workspace_id = $1 and user_id = $2', [wid, userId]);
    if (!other.length) throw new HttpError(404, 'User not found');
    const key = `${wid}:${[user.id, userId].sort().join(':')}`;
    const rows = await db.query<{ id: string }>(
      `insert into channels (workspace_id, name, is_dm, is_private, dm_key, created_by) values ($1, '', true, true, $2, $3)
       on conflict (dm_key) do update set dm_key = excluded.dm_key
       returning id`,
      [wid, key, user.id],
    );
    const id = rows[0].id;
    await db.query(
      'insert into channel_members (channel_id, user_id) values ($1, $2), ($1, $3) on conflict do nothing',
      [id, user.id, userId],
    );
    await hub.publish({ to: [...new Set([user.id, userId])], event: { type: 'channels.changed', workspaceId: wid } });
    return { id };
  });

  app.get('/api/workspaces/:wid/search', async (req) => {
    const user = me(req);
    const { wid } = parse(workspaceParams, req.params);
    await requireWorkspace(db, wid, user.id);
    const { q } = parse(z.object({ q: z.string().max(200) }), req.query);
    return searchMessages(db, ctx.files, user.id, wid, q);
  });
}
