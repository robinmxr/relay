import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { z } from 'zod';
import type { ServerEvent, User } from '@relay/shared';
import { hashToken, userFromToken } from './auth';
import type { Ctx } from './context';
import type { Db } from './db';
import { channelAccess, coworkerIds } from './queries';

const uuid = z.string().uuid();

const signal = z
  .object({
    description: z.object({ type: z.enum(['offer', 'answer', 'pranswer', 'rollback']), sdp: z.string().max(32_000).optional() }).optional(),
    candidate: z
      .object({
        candidate: z.string().max(2000),
        sdpMid: z.string().max(64).nullable().optional(),
        sdpMLineIndex: z.number().int().min(0).max(64).nullable().optional(),
        usernameFragment: z.string().max(256).nullable().optional(),
      })
      .optional(),
  })
  .refine((s) => s.description || s.candidate, 'empty signal');

const clientEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('auth'), token: z.string().min(1).max(200) }),
  z.object({ type: z.literal('ping') }),
  z.object({ type: z.literal('typing'), channelId: uuid }),
  z.object({ type: z.literal('huddle.join'), channelId: uuid }),
  z.object({ type: z.literal('huddle.leave') }),
  z.object({ type: z.literal('huddle.status'), muted: z.boolean(), sharing: z.boolean() }),
  z.object({ type: z.literal('huddle.signal'), to: uuid, data: signal }),
]);

const AUTH_TIMEOUT_MS = 5000;
const TYPING_INTERVAL_MS = 2000;
const LAST_SEEN_INTERVAL_MS = 5 * 60_000;

export async function publishHuddle(ctx: Ctx, channelId: string): Promise<void> {
  await ctx.hub.toChannel(ctx.db, channelId, {
    type: 'huddle.state',
    channelId,
    participants: ctx.huddles.participants(channelId),
    members: ctx.huddles.members(channelId),
  });
}

async function publishPresence(ctx: Ctx, userId: string, online: boolean): Promise<void> {
  await ctx.hub.publish({ to: await coworkerIds(ctx.db, userId), event: { type: 'presence', userId, online } });
}

function touchSession(db: Db, token: string): Promise<unknown> {
  return db.query('update sessions set last_seen_at = now() where token_hash = $1', [hashToken(token)]).catch(() => {});
}

/**
 * GET /ws. Browsers cannot set headers on a WebSocket, so the first frame carries the session
 * token instead of the URL (which would end up in logs). Unauthenticated sockets are closed.
 */
export function registerRealtime(app: FastifyInstance, ctx: Ctx): void {
  const { db, hub, huddles, presence } = ctx;

  app.get('/ws', { websocket: true }, (socket: WebSocket) => {
    let user: User | null = null;
    let authing = false;
    let sessionToken: string | null = null;
    let lastSeenAt = 0;
    let lastTyping = 0;
    let frames = 0;
    let windowStart = Date.now();
    const send = (ev: ServerEvent) => socket.send(JSON.stringify(ev));
    const authTimer = setTimeout(() => {
      if (!user) socket.close(4401, 'Authentication timeout');
    }, AUTH_TIMEOUT_MS);

    type Frame = z.infer<typeof clientEvent>;

    const handleFrame = async (ev: Frame, now: number): Promise<void> => {
      // The socket may have closed while this frame waited its turn.
      if (socket.readyState !== socket.OPEN) return;
      try {
        if (!user) {
          if (ev.type !== 'auth' || authing) {
            socket.close(4401, 'Authenticate first');
            return;
          }
          authing = true;
          const found = await userFromToken(db, ctx.files, ev.token);
          if (!found) {
            socket.close(4401, 'Invalid session');
            return;
          }
          if (socket.readyState !== socket.OPEN) return;
          user = found;
          sessionToken = ev.token;
          lastSeenAt = Date.now();
          clearTimeout(authTimer);
          hub.add(user.id, socket);
          void touchSession(db, ev.token);
          send({ type: 'hello', user });
          if (await presence.connect(user.id)) await publishPresence(ctx, user.id, true);
          return;
        }

        switch (ev.type) {
          case 'ping':
            send({ type: 'pong' });
            // The client pings every 25 s; refresh the session's last-seen every few minutes.
            if (sessionToken && Date.now() - lastSeenAt > LAST_SEEN_INTERVAL_MS) {
              lastSeenAt = Date.now();
              void touchSession(db, sessionToken);
            }
            break;
          case 'typing': {
            if (now - lastTyping < TYPING_INTERVAL_MS) return;
            lastTyping = now;
            const access = await channelAccess(db, ev.channelId, user.id);
            if (!access?.is_member) return;
            await hub.toChannel(db, ev.channelId, { type: 'typing', channelId: ev.channelId, userId: user.id, name: user.name }, user.id);
            break;
          }
          case 'huddle.join': {
            const access = await channelAccess(db, ev.channelId, user.id);
            if (!access?.is_member) return;
            const starting = huddles.participants(ev.channelId).length === 0;
            const left = huddles.join(ev.channelId, user.id, socket);
            if (left) await publishHuddle(ctx, left);
            await publishHuddle(ctx, ev.channelId);
            if (starting) {
              const [channel] = await db.query<{ name: string }>('select name from channels where id = $1', [ev.channelId]);
              await hub.toChannel(
                db,
                ev.channelId,
                {
                  type: 'huddle.started',
                  channelId: ev.channelId,
                  workspaceId: access.workspace_id,
                  channelName: channel?.name ?? '',
                  isDm: access.is_dm,
                  by: user,
                },
                user.id,
              );
            }
            break;
          }
          case 'huddle.leave': {
            const left = huddles.leave(user.id, socket);
            if (left) await publishHuddle(ctx, left);
            break;
          }
          case 'huddle.status': {
            const channelId = huddles.setStatus(user.id, socket, { muted: ev.muted, sharing: ev.sharing });
            if (channelId) await publishHuddle(ctx, channelId);
            break;
          }
          case 'huddle.signal': {
            const channelId = huddles.channelOf(user.id);
            if (!channelId || ev.to === user.id || huddles.channelOf(ev.to) !== channelId) return;
            await hub.publish({ to: [ev.to], event: { type: 'huddle.signal', channelId, from: user.id, data: ev.data } });
            break;
          }
        }
      } catch (err) {
        app.log.error(err);
      }
    };

    // Frames from one socket are handled strictly in arrival order: an async
    // handler per frame would let an ICE candidate be relayed ahead of the
    // offer it belongs to, and the receiver would have nowhere to put it.
    let queue: Promise<void> = Promise.resolve();
    socket.on('message', (raw) => {
      const now = Date.now();
      if (now - windowStart >= 1000) {
        windowStart = now;
        frames = 0;
      }
      if (++frames > ctx.limits.socketFramesPerSecond) {
        socket.close(4429, 'Too many messages');
        return;
      }

      let data: unknown;
      try {
        data = JSON.parse(raw.toString());
      } catch {
        return;
      }
      const parsed = clientEvent.safeParse(data);
      if (!parsed.success) return;
      queue = queue.then(() => handleFrame(parsed.data, now)).catch((err) => app.log.error(err));
    });

    socket.on('close', () => {
      clearTimeout(authTimer);
      if (!user) return;
      const u = user;
      hub.remove(u.id, socket);
      const left = huddles.leave(u.id, socket);
      (async () => {
        if (left) await publishHuddle(ctx, left);
        if (await presence.disconnect(u.id)) await publishPresence(ctx, u.id, false);
      })().catch((err) => app.log.error(err));
    });
  });
}
