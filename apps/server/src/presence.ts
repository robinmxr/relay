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
  const live = (userId: string) => redis.zcount(key(userId), Date.now(), '+inf');

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
      const before = await live(userId);
      await redis.multi().zadd(key(userId), Date.now() + TTL_MS, nodeId).pexpire(key(userId), TTL_MS).exec();
      return before === 0;
    },
    disconnect: async (userId) => {
      const n = local.get(userId) ?? 0;
      if (n > 1) {
        local.set(userId, n - 1);
        return false;
      }
      local.delete(userId);
      await redis.zrem(key(userId), nodeId);
      return (await live(userId)) === 0;
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
