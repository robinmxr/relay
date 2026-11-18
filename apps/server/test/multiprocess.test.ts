/**
 * Two server processes on one Postgres and one Redis. Needs TEST_DATABASE_URL and TEST_REDIS_URL
 * (CI provides both); skipped otherwise.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import WebSocket from 'ws';
import type { Message, ServerEvent, SignInResponse, Workspace } from '@relay/shared';
import { buildApp } from '../src/app';
import { redisPresence } from '../src/presence';

const databaseUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL;
const skip = !databaseUrl || !redisUrl ? 'set TEST_DATABASE_URL and TEST_REDIS_URL' : false;

type App = Awaited<ReturnType<typeof buildApp>>;
let a: App;
let b: App;
let filesDir: string;

const hostOf = (app: App) => `127.0.0.1:${(app.app.server.address() as AddressInfo).port}`;

before(async () => {
  if (skip) return;
  filesDir = await mkdtemp(path.join(tmpdir(), 'relay-mp-'));
  const opts = { devSignin: true, filesDir, databaseUrl, redisUrl, limits: { signinPerMinute: 1000, signinPerAccountPer15Minutes: 1000 } };
  // One after the other, so only one of them applies the migrations.
  a = await buildApp(opts);
  b = await buildApp(opts);
  await a.app.listen({ port: 0, host: '127.0.0.1' });
  await b.app.listen({ port: 0, host: '127.0.0.1' });
});

after(async () => {
  if (skip) return;
  await a.app.close();
  await b.app.close();
  await rm(filesDir, { recursive: true, force: true });
});

async function call<T>(app: App, method: 'GET' | 'POST', url: string, token?: string, body?: object) {
  const res = await app.app.inject({ method, url, headers: token ? { authorization: `Bearer ${token}` } : {}, ...(body ? { payload: body } : {}) });
  return { status: res.statusCode, json: res.json() as T };
}

async function connect(app: App, token: string) {
  const ws = new WebSocket(`ws://${hostOf(app)}/ws`);
  const events: ServerEvent[] = [];
  const waiters: (() => void)[] = [];
  ws.on('message', (data) => {
    events.push(JSON.parse(data.toString()) as ServerEvent);
    waiters.splice(0).forEach((w) => w());
  });
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  const waitFor = async <K extends ServerEvent['type']>(type: K, match: (e: Extract<ServerEvent, { type: K }>) => boolean = () => true) => {
    const deadline = Date.now() + 3000;
    for (;;) {
      const found = events.find((e) => e.type === type && match(e as Extract<ServerEvent, { type: K }>));
      if (found) return found as Extract<ServerEvent, { type: K }>;
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${type}`);
      await new Promise<void>((resolve) => {
        waiters.push(resolve);
        setTimeout(resolve, 100);
      });
    }
  };
  ws.send(JSON.stringify({ type: 'auth', token }));
  await waitFor('hello');
  return {
    events,
    waitFor,
    close: () => new Promise<void>((resolve) => (ws.once('close', () => resolve()), ws.close())),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

test('a message posted on one process reaches a socket on the other', { skip }, async () => {
  const tag = randomUUID().slice(0, 8);
  const alice = (await call<SignInResponse>(a, 'POST', '/api/auth/signin', undefined, { email: `alice-${tag}@example.com` })).json;
  const bob = (await call<SignInResponse>(b, 'POST', '/api/auth/signin', undefined, { email: `bob-${tag}@example.com` })).json;
  const [hq] = (await call<Workspace[]>(a, 'GET', '/api/workspaces', alice.token)).json;
  const channels = (await call<{ id: string; name: string }[]>(a, 'GET', `/api/workspaces/${hq.id}/channels`, alice.token)).json;
  const general = channels.find((c) => c.name === 'general')!;

  const bobSocket = await connect(b, bob.token);
  try {
    const posted = await call<Message>(a, 'POST', `/api/channels/${general.id}/messages`, alice.token, { body: `hello from A ${tag}` });
    assert.equal(posted.status, 200);
    const got = await bobSocket.waitFor('message.created', (e) => e.message.id === posted.json.id);
    assert.equal(got.message.body, `hello from A ${tag}`);
  } finally {
    await bobSocket.close();
  }
});

test('presence flips once when the same user is connected to both processes', { skip }, async () => {
  const tag = randomUUID().slice(0, 8);
  const watcher = (await call<SignInResponse>(a, 'POST', '/api/auth/signin', undefined, { email: `watch-${tag}@example.com` })).json;
  const carol = (await call<SignInResponse>(a, 'POST', '/api/auth/signin', undefined, { email: `carol-${tag}@example.com` })).json;
  const watch = await connect(a, watcher.token);
  const presenceOf = () => watch.events.filter((e) => e.type === 'presence' && e.userId === carol.user.id).map((e) => (e as { online: boolean }).online);
  try {
    const onA = await connect(a, carol.token);
    const onB = await connect(b, carol.token);
    await settle();
    assert.deepEqual(presenceOf(), [true]);
    await onA.close();
    await settle();
    assert.deepEqual(presenceOf(), [true], 'still connected on B');
    await onB.close();
    await watch.waitFor('presence', (e) => e.userId === carol.user.id && !e.online);
    assert.deepEqual(presenceOf(), [true, false]);
  } finally {
    await watch.close();
  }
});

test('redis presence: a connect and a disconnect racing on two processes keep the user online', { skip }, async () => {
  const p1 = await redisPresence(redisUrl!, 'node-1');
  const p2 = await redisPresence(redisUrl!, 'node-2');
  try {
    for (let i = 0; i < 20; i++) {
      const user = randomUUID();
      assert.equal(await p1.connect(user), true);
      // The user's last socket on node-1 closes while a new one opens on node-2.
      const [wentOffline, cameOnline] = await Promise.all([p1.disconnect(user), p2.connect(user)]);
      assert.ok((await p1.online([user])).has(user), 'connected on node-2, so online');
      // Either order is fine, but the transitions must pair up: offline-then-online, or neither.
      assert.equal(wentOffline, cameOnline, `round ${i}: offline=${wentOffline} online=${cameOnline}`);
      assert.equal(await p2.disconnect(user), true);
    }
  } finally {
    await p1.close();
    await p2.close();
  }
});
