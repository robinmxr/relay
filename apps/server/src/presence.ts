/**
 * Who is online. Each socket calls connect/disconnect; the return value says whether the user's
 * global online state changed, so the caller knows when to publish a presence event.
 */
export interface Presence {
  connect(userId: string): Promise<boolean>;
  disconnect(userId: string): Promise<boolean>;
  online(userIds: string[]): Promise<Set<string>>;
  close(): Promise<void>;
}

/** Single process: count sockets in memory. */
export function localPresence(): Presence {
  const counts = new Map<string, number>();
  return {
    connect: async (userId) => {
      const n = counts.get(userId) ?? 0;
      counts.set(userId, n + 1);
      return n === 0;
    },
    disconnect: async (userId) => {
      const n = counts.get(userId) ?? 0;
      if (n <= 1) {
        counts.delete(userId);
        return n === 1;
      }
      counts.set(userId, n - 1);
      return false;
    },
    online: async (userIds) => new Set(userIds.filter((id) => counts.has(id))),
    close: async () => {},
  };
}

const TTL_MS = 60_000;

/**
 * Several processes: each user has a Redis sorted set of the server processes holding their
 * sockets, scored by an expiry that each process refreshes. A crashed process's entries expire
 * after TTL_MS, so its users read as offline (no offline event is sent for them).
 */
export async function redisPresence(url: string, nodeId: string): Promise<Presence> {
  const { Redis } = await import('ioredis');
  const redis = new Redis(url);
  const local = new Map<string, number>();
  const key = (userId: string) => `relay:presence:${userId}`;

  // Each transition changes the set and reads the global state in one atomic step, so a connect
  // on one process and a disconnect on another cannot both see the other's "before" state.
  redis.defineCommand('presenceConnect', {
    numberOfKeys: 1,
    // ARGV: now, expiry, nodeId, ttl. Returns 1 when the user went from offline to online.
    lua: `
      redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', '(' .. ARGV[1])
      local others = redis.call('ZCOUNT', KEYS[1], ARGV[1], '+inf')
      if redis.call('ZSCORE', KEYS[1], ARGV[3]) then others = others - 1 end
      redis.call('ZADD', KEYS[1], ARGV[2], ARGV[3])
      redis.call('PEXPIRE', KEYS[1], ARGV[4])
      if others == 0 then return 1 else return 0 end`,
  });
  redis.defineCommand('presenceDisconnect', {
    numberOfKeys: 1,
    // ARGV: now, nodeId. Returns 1 when no live process holds the user any more.
    lua: `
      redis.call('ZREM', KEYS[1], ARGV[2])
      if redis.call('ZCOUNT', KEYS[1], ARGV[1], '+inf') == 0 then return 1 else return 0 end`,
  });
  type Scripts = {
    presenceConnect(key: string, now: number, expiry: number, nodeId: string, ttl: number): Promise<number>;
    presenceDisconnect(key: string, now: number, nodeId: string): Promise<number>;
  };
  const scripts = redis as unknown as Scripts;

  const refresh = setInterval(() => {
    if (local.size === 0) return;
    const expiry = Date.now() + TTL_MS;
    const p = redis.pipeline();
    for (const userId of local.keys()) p.zadd(key(userId), expiry, nodeId).pexpire(key(userId), TTL_MS);
    p.exec().catch((err) => console.error('presence refresh failed', err));
  }, TTL_MS / 3);
  refresh.unref();

  return {
    connect: async (userId) => {
      const n = local.get(userId) ?? 0;
      local.set(userId, n + 1);
      if (n > 0) return false;
      const now = Date.now();
      return (await scripts.presenceConnect(key(userId), now, now + TTL_MS, nodeId, TTL_MS)) === 1;
    },
    disconnect: async (userId) => {
      const n = local.get(userId) ?? 0;
      if (n > 1) {
        local.set(userId, n - 1);
        return false;
      }
      local.delete(userId);
      return (await scripts.presenceDisconnect(key(userId), Date.now(), nodeId)) === 1;
    },
    online: async (userIds) => {
      if (userIds.length === 0) return new Set();
      const now = Date.now();
      const p = redis.pipeline();
      for (const id of userIds) p.zcount(key(id), now, '+inf');
      const results = (await p.exec()) ?? [];
      return new Set(userIds.filter((_, i) => Number(results[i]?.[1] ?? 0) > 0));
    },
    close: async () => {
      clearInterval(refresh);
      if (local.size) {
        const p = redis.pipeline();
        for (const userId of local.keys()) p.zrem(key(userId), nodeId);
        await p.exec().catch(() => {});
      }
      redis.disconnect();
    },
  };
}
