import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyError } from 'fastify';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import { LIMITS, type RtcConfig, type User } from '@relay/shared';
import { bearer, userFromToken } from './auth';
import { DEFAULT_LIMITS, type Ctx, type Limits } from './context';
import { migrate, openDb, seed } from './db';
import { FileStore } from './files';
import { Hub, localBus, redisBus } from './hub';
import { Huddles } from './huddles';
import { localPresence, redisPresence } from './presence';
import { registerRealtime } from './realtime';
import { authRoutes } from './routes/auth';
import { channelRoutes } from './routes/channels';
import { fileRoutes } from './routes/files';
import { meRoutes } from './routes/me';
import { messageRoutes } from './routes/messages';
import { workspaceRoutes } from './routes/workspaces';

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
  }
}

export interface AppOptions {
  databaseUrl?: string;
  /** PGlite directory when no databaseUrl. Unset means in-memory. */
  dataDir?: string;
  /** Where uploads are stored. */
  filesDir: string;
  redisUrl?: string;
  devSignin: boolean;
  autoJoinDefault?: boolean;
  /** Built web client to serve from the same origin (apps/web/dist). */
  webDist?: string;
  rtc?: RtcConfig;
  limits?: Partial<Limits>;
  logger?: boolean;
}

const CSP = [
  "default-src 'self'",
  "connect-src 'self' ws: wss:",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

export async function buildApp(opts: AppOptions) {
  const db = await openDb(opts.databaseUrl, opts.dataDir);
  await migrate(db);
  const defaultWorkspaceId = await seed(db);

  const nodeId = randomUUID();
  const hub = new Hub(opts.redisUrl ? await redisBus(opts.redisUrl) : localBus());
  const presence = opts.redisUrl ? await redisPresence(opts.redisUrl, nodeId) : localPresence();
  const limits = { ...DEFAULT_LIMITS, ...opts.limits };

  const ctx: Ctx = {
    db,
    hub,
    presence,
    huddles: new Huddles(),
    files: await FileStore.open(db, opts.filesDir),
    devSignin: opts.devSignin,
    autoJoinDefault: opts.autoJoinDefault ?? true,
    defaultWorkspaceId,
    rtc: opts.rtc ?? { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
    limits,
  };

  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 256 * 1024 });

  app.decorateRequest('user', null);
  app.addHook('onRequest', async (req) => {
    req.user = await userFromToken(db, ctx.files, bearer(req.headers.authorization));
  });

  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Content-Security-Policy', CSP);
  });

  app.setErrorHandler((err: FastifyError, req, reply) => {
    const status = err.statusCode ?? 500;
    if (status >= 500) req.log.error(err);
    reply.code(status).send({ error: status >= 500 ? 'Internal server error' : err.message });
  });

  let rateRedis: { disconnect(): void } | undefined;
  if (opts.redisUrl) {
    const { Redis } = await import('ioredis');
    rateRedis = new Redis(opts.redisUrl, { connectTimeout: 500, maxRetriesPerRequest: 1 });
  }
  await app.register(rateLimit, {
    global: true,
    max: limits.requestsPerMinute,
    timeWindow: '1 minute',
    hook: 'preHandler',
    keyGenerator: (req) => req.user?.id ?? req.ip,
    ...(rateRedis ? { redis: rateRedis } : {}),
  });
  await app.register(multipart, { limits: { fileSize: LIMITS.fileBytes, files: 1, fields: 0 } });
  await app.register(websocket, { options: { maxPayload: 64 * 1024 } });

  authRoutes(app, ctx);
  meRoutes(app, ctx);
  workspaceRoutes(app, ctx);
  channelRoutes(app, ctx);
  messageRoutes(app, ctx);
  fileRoutes(app, ctx);
  registerRealtime(app, ctx);

  const webRoot = opts.webDist ? path.resolve(opts.webDist) : null;
  if (webRoot && existsSync(path.join(webRoot, 'index.html'))) {
    await app.register(fastifyStatic, { root: webRoot });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/') || req.url === '/ws') return reply.code(404).send({ error: 'Not found' });
      return reply.sendFile('index.html');
    });
  }

  app.addHook('onClose', async () => {
    await presence.close();
    await hub.close();
    rateRedis?.disconnect();
    await db.close();
  });

  return { app, ctx };
}
