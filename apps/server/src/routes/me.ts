import { Readable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AvatarResponse, MeResponse, SessionInfo, UserSettings } from '@relay/shared';
import { bearer, hashToken, revokeOtherSessions } from '../auth';
import type { Ctx } from '../context';
import { HttpError, parse } from '../errors';
import { cleanMime, isImage } from '../files';
import { hashPassword, hashRecoveryCode, newRecoveryCode, verifyPassword } from '../password';
import { announceProfileChange, toUser, USER_COLUMNS, type UserRow } from '../users';
import { me } from './util';

type FullUserRow = UserRow & { password_hash: string | null; must_change: boolean };

interface SettingsRow {
  theme: 'system' | 'light' | 'dark';
  sound: boolean;
  desktop_notifications: boolean;
  notify_level: 'all' | 'mentions';
}

const DEFAULT_SETTINGS: UserSettings = { theme: 'system', sound: true, desktopNotifications: true, notifyLevel: 'all' };

const patchMeBody = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  status: z
    .union([
      z.null(),
      z.object({
        emoji: z.string().trim().min(1).max(16),
        text: z.string().trim().max(80).default(''),
        expiresInMinutes: z.number().int().min(1).max(7 * 24 * 60).nullable().optional(),
      }),
    ])
    .optional(),
});

const changePasswordBody = z.object({
  currentPassword: z.string().min(1).max(200).optional(),
  password: z.string().min(8, 'use at least 8 characters').max(200),
});

const settingsBody = z.object({
  theme: z.enum(['system', 'light', 'dark']).optional(),
  sound: z.boolean().optional(),
  desktopNotifications: z.boolean().optional(),
  notifyLevel: z.enum(['all', 'mentions']).optional(),
});

const AVATAR_BYTES = 2 * 1024 * 1024;
const SETTINGS_COLUMNS = 'theme, sound, desktop_notifications, notify_level';

function settingsOut(r: SettingsRow | undefined): UserSettings {
  return r ? { theme: r.theme, sound: r.sound, desktopNotifications: r.desktop_notifications, notifyLevel: r.notify_level } : DEFAULT_SETTINGS;
}

export function meRoutes(app: FastifyInstance, ctx: Ctx): void {
  const { db, files, hub } = ctx;

  const fullUser = async (id: string): Promise<FullUserRow> => {
    const rows = await db.query<FullUserRow>(`select ${USER_COLUMNS}, u.password_hash, u.must_change from users u where u.id = $1`, [id]);
    const row = rows[0];
    if (!row) throw new HttpError(401, 'Not signed in');
    return row;
  };

  const asMe = async (id: string): Promise<MeResponse> => {
    const row = await fullUser(id);
    return { ...toUser(files, row), passwordSet: row.password_hash !== null, mustChange: row.must_change };
  };

  app.get('/api/me', async (req): Promise<MeResponse> => asMe(me(req).id));

  /** Profile edits. Status null clears it; expiresInMinutes null means "until cleared". */
  app.patch('/api/me', async (req): Promise<MeResponse> => {
    const user = me(req);
    const body = parse(patchMeBody, req.body ?? {});
    if (body.name === undefined && body.status === undefined) throw new HttpError(400, 'Nothing to update');
    const sets: string[] = [];
    const values: unknown[] = [user.id];
    if (body.name !== undefined) {
      values.push(body.name);
      sets.push(`name = $${values.length}`);
    }
    if (body.status !== undefined) {
      if (body.status === null) {
        sets.push('status_emoji = null, status_text = null, status_expires_at = null');
      } else {
        values.push(body.status.emoji, body.status.text, body.status.expiresInMinutes ?? null);
        sets.push(
          `status_emoji = $${values.length - 2}, status_text = $${values.length - 1}, ` +
            `status_expires_at = case when $${values.length}::int is null then null else now() + make_interval(mins => $${values.length}::int) end`,
        );
      }
    }
    await db.query(`update users set ${sets.join(', ')} where id = $1`, values);
    await announceProfileChange(db, hub, user.id);
    return asMe(user.id);
  });

  /**
   * Avatar upload; replaces any previous one. The storage key is the user id,
   * so /api/avatars/:id knows where to look; save() refuses to overwrite, hence the remove.
   */
  app.post(
    '/api/me/avatar',
    { config: { rateLimit: { max: ctx.limits.uploadsPerMinute, timeWindow: '1 minute', keyGenerator: (req: { ip: string }) => req.ip } } },
    async (req): Promise<AvatarResponse> => {
      const user = me(req);
      if (!req.isMultipart()) throw new HttpError(400, 'Expected a multipart upload');
      const part = await req.file({ limits: { fileSize: AVATAR_BYTES } });
      if (!part) throw new HttpError(400, 'Expected a multipart upload');
      const buf = await part.toBuffer();
      if (part.file.truncated || buf.length > AVATAR_BYTES) throw new HttpError(400, 'Avatars can be at most 2 MB');
      if (!buf.length) throw new HttpError(400, 'That upload was empty');
      const mime = cleanMime(part.mimetype);
      if (!isImage(mime)) throw new HttpError(400, 'Avatars must be a PNG, JPEG, GIF or WebP image');
      const old = await db.query<{ avatar_key: string | null }>('select avatar_key from users where id = $1', [user.id]);
      if (old[0]?.avatar_key) await files.remove(old[0].avatar_key);
      try {
        await files.save(user.id, Readable.from(buf));
      } catch (err) {
        if ((err as { code?: string }).code === 'EEXIST') throw new HttpError(409, 'Could not save the avatar, try again');
        throw err;
      }
      const saved = await db.query<{ avatar_updated_at: Date }>(
        'update users set avatar_key = $2, avatar_mime = $3, avatar_updated_at = now() where id = $1 returning avatar_updated_at',
        [user.id, user.id, mime],
      );
      await announceProfileChange(db, hub, user.id);
      return { avatarUrl: files.avatarUrl(user.id, saved[0].avatar_updated_at) };
    },
  );

  app.delete('/api/me/avatar', async (req) => {
    const user = me(req);
    const rows = await db.query<{ avatar_key: string | null }>('select avatar_key from users where id = $1', [user.id]);
    if (rows[0]?.avatar_key) await files.remove(rows[0].avatar_key);
    await db.query('update users set avatar_key = null, avatar_mime = null, avatar_updated_at = null where id = $1', [user.id]);
    await announceProfileChange(db, hub, user.id);
    return { ok: true };
  });

  /** The avatar image itself; <img> cannot send an auth header, so the URL is signed like file downloads. */
  app.get('/api/avatars/:id', async (req, reply) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { exp, sig } = parse(z.object({ exp: z.coerce.number(), sig: z.string().min(1).max(200) }), req.query);
    if (!files.verify(id, exp, sig)) throw new HttpError(403, 'That link has expired');
    const rows = await db.query<{ avatar_key: string | null; avatar_mime: string | null }>(
      'select avatar_key, avatar_mime from users where id = $1',
      [id],
    );
    if (!rows[0]?.avatar_key) throw new HttpError(404, 'No avatar');
    reply.header('Content-Type', rows[0].avatar_mime ?? 'application/octet-stream');
    reply.header('Cache-Control', 'private, max-age=86400');
    return files.read(rows[0].avatar_key);
  });

  app.get('/api/me/settings', async (req): Promise<UserSettings> => {
    const rows = await db.query<SettingsRow>(`select ${SETTINGS_COLUMNS} from user_settings where user_id = $1`, [me(req).id]);
    return settingsOut(rows[0]);
  });

  app.patch('/api/me/settings', async (req): Promise<UserSettings> => {
    const user = me(req);
    const body = parse(settingsBody, req.body ?? {});
    const rows = await db.query<SettingsRow>(`select ${SETTINGS_COLUMNS} from user_settings where user_id = $1`, [user.id]);
    const next: UserSettings = { ...settingsOut(rows[0]), ...body };
    await db.query(
      `insert into user_settings (user_id, theme, sound, desktop_notifications, notify_level)
       values ($1, $2, $3, $4, $5)
       on conflict (user_id) do update set theme = $2, sound = $3, desktop_notifications = $4, notify_level = $5`,
      [user.id, next.theme, next.sound, next.desktopNotifications, next.notifyLevel],
    );
    return next;
  });

  /**
   * Sets the first password (a session proves identity for accounts that have none),
   * or changes an existing one with the current password — unless it is the default
   * starting password, which is replaced without asking for it back.
   * Either way a fresh recovery code comes back and other sessions are signed out.
   */
  app.post('/api/me/password', async (req): Promise<{ recoveryCode: string }> => {
    const user = me(req);
    const body = parse(changePasswordBody, req.body);
    const token = bearer(req.headers.authorization);
    const rows = await db.query<{ password_hash: string | null; must_change: boolean }>('select password_hash, must_change from users where id = $1', [user.id]);
    const current = rows[0]?.password_hash ?? null;
    if (current && !rows[0]?.must_change && (!body.currentPassword || !(await verifyPassword(body.currentPassword, current)))) {
      throw new HttpError(403, 'Current password is wrong');
    }
    const next = newRecoveryCode();
    await db.query('update users set password_hash = $2, recovery_hash = $3, must_change = false where id = $1', [
      user.id,
      await hashPassword(body.password),
      next.hash,
    ]);
    await revokeOtherSessions(db, user.id, token);
    return { recoveryCode: next.code };
  });

  app.get('/api/me/sessions', async (req): Promise<SessionInfo[]> => {
    const user = me(req);
    const rows = await db.query<{ id: string; token_hash: string; created_at: Date | string; last_seen_at: Date | string; user_agent: string | null }>(
      'select id, token_hash, created_at, last_seen_at, user_agent from sessions where user_id = $1 and expires_at > now() order by last_seen_at desc',
      [user.id],
    );
    const current = hashToken(bearer(req.headers.authorization) ?? '');
    return rows.map((r) => ({
      id: r.id,
      createdAt: new Date(r.created_at).toISOString(),
      lastSeenAt: new Date(r.last_seen_at).toISOString(),
      userAgent: r.user_agent,
      current: r.token_hash === current,
    }));
  });

  app.delete('/api/me/sessions/:id', async (req) => {
    const user = me(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const gone = await db.query('delete from sessions where id = $1 and user_id = $2 returning id', [id, user.id]);
    if (!gone.length) throw new HttpError(404, 'Session not found');
    return { ok: true };
  });

  app.post('/api/me/sessions/revoke-others', async (req) => {
    const user = me(req);
    await revokeOtherSessions(db, user.id, bearer(req.headers.authorization));
    return { ok: true };
  });
}
