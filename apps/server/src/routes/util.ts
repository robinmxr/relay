import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { User } from '@relay/shared';
import { HttpError } from '../errors';

export const uuid = z.string().uuid();
export const idParams = z.object({ id: uuid });
export const workspaceParams = z.object({ wid: uuid });

export function me(req: FastifyRequest): User {
  if (!req.user) throw new HttpError(401, 'Sign in required');
  return req.user;
}

/** Rate-limit key: the user when signed in, else the IP. */
export function rateKey(req: FastifyRequest): string {
  return req.user?.id ?? req.ip;
}
