import type { RtcConfig } from '@relay/shared';
import type { Db } from './db';
import type { FileStore } from './files';
import type { Hub } from './hub';
import type { Huddles } from './huddles';
import type { Presence } from './presence';

export interface Limits {
  /** Per IP. */
  signinPerMinute: number;
  /** Per user, per channel post endpoint. */
  messagesPer10Seconds: number;
  uploadsPerMinute: number;
  /** Per user (or IP when signed out), across all routes. */
  requestsPerMinute: number;
  /** Per WebSocket. */
  socketFramesPerSecond: number;
}

export const DEFAULT_LIMITS: Limits = {
  signinPerMinute: 10,
  messagesPer10Seconds: 30,
  uploadsPerMinute: 30,
  requestsPerMinute: 1200,
  socketFramesPerSecond: 50,
};

/** Everything route handlers need. */
export interface Ctx {
  db: Db;
  hub: Hub;
  presence: Presence;
  huddles: Huddles;
  files: FileStore;
  devSignin: boolean;
  /** Whether sign-in adds everyone to the default workspace. */
  autoJoinDefault: boolean;
  defaultWorkspaceId: string;
  rtc: RtcConfig;
  limits: Limits;
}
