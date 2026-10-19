import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { RtcConfig, SignInResponse, User } from '@relay/shared';
import { bearer, createSession, hashToken } from '../auth';
import type { Ctx } from '../context';
import { HttpError, parse } from '../errors';
import { joinWorkspace } from '../queries';
import { me } from './util';

const signInBody = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().min(1).max(80).optional(),
});

export function authRoutes(app: FastifyInstance, ctx: Ctx): void {
  const { db } = ctx;

  app.get('/api/health', async () => ({ ok: true }));

  // Passwordless development sign-in. Replace with email links or SSO before real use.
  app.post(
    '/api/auth/signin',
    { config: { rateLimit: { max: ctx.limits.signinPerMinute, timeWindow: '1 minute', keyGenerator: (req) => req.ip } } },
    async (req): Promise<SignInResponse> => {
      if (!ctx.devSignin) throw new HttpError(404, 'Not found');
      const body = parse(signInBody, req.body);
      const name = body.name ?? body.email.split('@')[0];
      const rows = await db.query<User>(
        `insert into users (email, name) values ($1, $2)
         on conflict (email) do update set name = coalesce($3::text, users.name)
         returning id, email, name`,
        [body.email, name, body.name ?? null],
      );
      const user = rows[0];
      if (ctx.autoJoinDefault) await joinWorkspace(db, ctx.defaultWorkspaceId, user.id);
      return { token: await createSession(db, user.id), user };
    },
  );

  app.post('/api/auth/signout', async (req) => {
    const token = bearer(req.headers.authorization);
    if (token) await db.query('delete from sessions where token_hash = $1', [hashToken(token)]);
    return { ok: true };
  });

  app.get('/api/me', async (req) => me(req));

  app.get('/api/rtc-config', async (req): Promise<RtcConfig> => {
    me(req);
    return ctx.rtc;
  });
}
