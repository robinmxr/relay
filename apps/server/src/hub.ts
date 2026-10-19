import { EventEmitter } from 'node:events';
import type { WebSocket } from 'ws';
import type { ServerEvent } from '@relay/shared';
import type { Db } from './db';
import { channelMemberIds, workspaceMemberIds } from './queries';

/** An event addressed to users. Every server process gets every envelope and delivers to its own sockets. */
export interface Envelope {
  to: string[];
  event: ServerEvent;
  except?: string;
}

export interface Bus {
  publish(env: Envelope): Promise<void>;
  subscribe(fn: (env: Envelope) => void): void;
  close(): Promise<void>;
}

/** Single process: deliver in memory. */
export function localBus(): Bus {
  const emitter = new EventEmitter();
  return {
    publish: async (env) => {
      emitter.emit('envelope', env);
    },
    subscribe: (fn) => {
      emitter.on('envelope', fn);
    },
    close: async () => {
      emitter.removeAllListeners();
    },
  };
}

/** Several processes: fan out through Redis pub/sub. */
export async function redisBus(url: string): Promise<Bus> {
  const { Redis } = await import('ioredis');
  const pub = new Redis(url);
  const sub = new Redis(url);
  const topic = 'relay:events';
  const listeners: ((env: Envelope) => void)[] = [];
  await sub.subscribe(topic);
  sub.on('message', (_channel, raw) => {
    const env = JSON.parse(raw) as Envelope;
    for (const fn of listeners) fn(env);
  });
  return {
    publish: async (env) => {
      await pub.publish(topic, JSON.stringify(env));
    },
    subscribe: (fn) => {
      listeners.push(fn);
    },
    close: async () => {
      sub.disconnect();
      pub.disconnect();
    },
  };
}

/** This process's sockets, by user, and delivery of bus events to them. */
export class Hub {
  private sockets = new Map<string, Set<WebSocket>>();

  constructor(private bus: Bus) {
    bus.subscribe((env) => this.deliver(env));
  }

  add(userId: string, ws: WebSocket): void {
    let set = this.sockets.get(userId);
    if (!set) {
      set = new Set();
      this.sockets.set(userId, set);
    }
    set.add(ws);
  }

  remove(userId: string, ws: WebSocket): void {
    const set = this.sockets.get(userId);
    set?.delete(ws);
    if (set && set.size === 0) this.sockets.delete(userId);
  }

  publish(env: Envelope): Promise<void> {
    return env.to.length ? this.bus.publish(env) : Promise.resolve();
  }

  async toChannel(db: Db, channelId: string, event: ServerEvent, except?: string): Promise<void> {
    await this.publish({ to: await channelMemberIds(db, channelId), event, except });
  }

  async toWorkspace(db: Db, workspaceId: string, event: ServerEvent, except?: string): Promise<void> {
    await this.publish({ to: await workspaceMemberIds(db, workspaceId), event, except });
  }

  close(): Promise<void> {
    return this.bus.close();
  }

  private deliver(env: Envelope): void {
    const data = JSON.stringify(env.event);
    for (const userId of env.to) {
      if (userId === env.except) continue;
      for (const ws of this.sockets.get(userId) ?? []) {
        if (ws.readyState === ws.OPEN) ws.send(data);
      }
    }
  }
}
