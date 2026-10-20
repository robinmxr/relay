import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { SignInResponse } from '@relay/shared';
import { bearer, createSession, hashToken } from '../auth';
import type { Ctx } from '../context';
import { HttpError, parse } from '../errors';
import { joinWorkspace } from '../queries';
import { newRecoveryCode, hashRecoveryCode, hashPassword, verifyPassword } from '../password';
import { me } from './util';

const emailField = z.string().trim().toLowerCase().email().max(254);
const passwordField = z.string().min(8, 'use at least 8 characters').max(200);

const signInBody = z.object({
  email: emailField,
  name: z.string().trim().min(1).max(80).optional(),
  password: z.string().min(1).max(200).optional(),
});

const signUpBody = z.object({
  email: emailField,
  name: z.string().trim().min(1).max(80).optional(),
  password: passwordField,
});

const recoverBody = z.object({
  email: emailField,
  code: z.string().min(8).max(64),
  password: passwordField,
});

export function authRoutes(app: FastifyInstance, ctx: Ctx): void {
  const { db } = ctx;
  const signinLimit = {
    config: { rateLimit: { max: ctx.limits.signinPerMinute, timeWindow: '1 minute', keyGenerator: (req: { ip: string }) => req.ip } },
  };

  app.get('/api/health', async () => ({ ok: true }));

  /**
   * Password sign-in, plus the development path when RELAY_DEV_SIGNIN=true:
   * an email alone creates or opens an account, with no password.
   * Accounts that already have a password always need it, even in dev mode.
   */
  app.post('/api/auth/signin', signinLimit, async (req): Promise<SignInResponse> => {
    const body = parse(signInBody, req.body);
    const rows = await db.query<{ id: string; email: string; name: string; password_hash: string | null }>(
      'select id, email, name, password_hash from users where email = $1',
      [body.email],
    );
    const user = rows[0];

    if (user?.password_hash) {
      if (!body.password || !(await verifyPassword(body.password, user.password_hash))) {
        throw new HttpError(401, 'Wrong email or password');
      }
    } else if (!ctx.devSignin) {
      if (!user) throw new HttpError(401, 'Wrong email or password');
      throw new HttpError(403, 'This account has no password yet. Sign in with your recovery code, or ask the workspace owner to reset it.');
    } else if (!user) {
      // A password means sign-in, which never creates accounts; creation is signup's job.
      if (body.password) throw new HttpError(401, 'Wrong email or password');
      // Development sign-in creates the account, as it always has.
      const name = body.name ?? body.email.split('@')[0];
      const created = await db.query<{ id: string; email: string; name: string }>(
        'insert into users (email, name) values ($1, $2) on conflict (email) do nothing returning id, email, name',
        [body.email, name],
      );
      if (!created[0]) throw new HttpError(409, 'Could not create the account, try again');
      if (ctx.autoJoinDefault) await joinWorkspace(db, ctx.defaultWorkspaceId, created[0].id);
      return { token: await createSession(db, created[0].id, req.headers['user-agent']), user: created[0], passwordSet: false };
    }

    // A passwordless dev-mode account may take a display name from the form.
    if (user.password_hash === null && body.name && body.name !== user.name) {
      await db.query('update users set name = $2 where id = $1', [user.id, body.name]);
      user.name = body.name;
    }
    return {
      token: await createSession(db, user.id, req.headers['user-agent']),
      user: { id: user.id, email: user.email, name: user.name },
      passwordSet: user.password_hash !== null,
    };
  });

  /** Creates an account with a password. Returns the recovery code exactly once. */
  app.post('/api/auth/signup', signinLimit, async (req): Promise<SignInResponse> => {
    const body = parse(signUpBody, req.body);
    const { code, hash } = newRecoveryCode();
    let created: { id: string; email: string; name: string };
    try {
      const rows = await db.query<{ id: string; email: string; name: string }>(
        'insert into users (email, name, password_hash, recovery_hash) values ($1, $2, $3, $4) returning id, email, name',
        [body.email, body.name ?? body.email.split('@')[0], await hashPassword(body.password), hash],
      );
      created = rows[0];
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw new HttpError(409, 'An account with that email already exists');
      throw err;
    }
    if (ctx.autoJoinDefault) await joinWorkspace(db, ctx.defaultWorkspaceId, created.id);
    return { token: await createSession(db, created.id, req.headers['user-agent']), user: created, passwordSet: true, recoveryCode: code };
  });

  /** The no-email recovery path: email + recovery code + new password. */
  app.post('/api/auth/recover', signinLimit, async (req): Promise<SignInResponse> => {
    const body = parse(recoverBody, req.body);
    const rows = await db.query<{ id: string; email: string; name: string; recovery_hash: string | null }>(
      'select id, email, name, recovery_hash from users where email = $1',
      [body.email],
    );
    const user = rows[0];
    if (!user || !user.recovery_hash || hashRecoveryCode(body.code) !== user.recovery_hash) {
      throw new HttpError(401, 'Wrong email or recovery code');
    }
    const next = newRecoveryCode();
    await db.query('update users set password_hash = $2, recovery_hash = $3 where id = $1', [user.id, await hashPassword(body.password), next.hash]);
    // Someone with the recovery code may be taking over a hijacked account.
    await db.query('delete from sessions where user_id = $1', [user.id]);
    return {
      token: await createSession(db, user.id, req.headers['user-agent']),
      user: { id: user.id, email: user.email, name: user.name },
      passwordSet: true,
      recoveryCode: next.code,
    };
  });

  app.post('/api/auth/signout', async (req) => {
    const token = bearer(req.headers.authorization);
    if (token) await db.query('delete from sessions where token_hash = $1', [hashToken(token)]);
    return { ok: true };
  });

  app.get('/api/rtc-config', async (req) => {
    me(req);
    return ctx.rtc;
  });
}
