import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import WebSocket from 'ws';
import type { Channel, FileInfo, Message, ServerEvent, SignInResponse, UserWithPresence, Workspace } from '@relay/shared';
import { buildApp } from '../src/app';

let ctx: Awaited<ReturnType<typeof buildApp>>;
let host: string;
let filesDir: string;

before(async () => {
  filesDir = await mkdtemp(path.join(tmpdir(), 'relay-test-'));
  ctx = await buildApp({ devSignin: true, filesDir });
  await ctx.app.listen({ port: 0, host: '127.0.0.1' });
  host = `127.0.0.1:${(ctx.app.server.address() as AddressInfo).port}`;
});

after(async () => {
  await ctx.app.close();
  await rm(filesDir, { recursive: true, force: true });
});

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

async function call<T = any>(method: Method, url: string, token?: string, body?: unknown, app = ctx.app) {
  const res = await app.inject({
    method,
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(body !== undefined ? { payload: body as object } : {}),
  });
  let json: T;
  try {
    json = res.json() as T;
  } catch {
    json = undefined as T;
  }
  return { status: res.statusCode, json, headers: res.headers, raw: res.rawPayload };
}

async function upload(token: string, channelId: string, name: string, mime: string, content: Buffer) {
  const boundary = '----relaytest';
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${mime}\r\n\r\n`),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await ctx.app.inject({
    method: 'POST',
    url: `/api/channels/${channelId}/files`,
    headers: { authorization: `Bearer ${token}`, 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload,
  });
  return { status: res.statusCode, json: res.json() as FileInfo };
}

async function signIn(email: string, name: string) {
  const res = await call<SignInResponse>('POST', '/api/auth/signin', undefined, { email, name });
  assert.equal(res.status, 200);
  return res.json;
}

async function connect(token: string) {
  const ws = new WebSocket(`ws://${host}/ws`);
  const queued: ServerEvent[] = [];
  const waiters: { type: string; resolve: (e: ServerEvent) => void }[] = [];
  ws.on('message', (data) => {
    const ev = JSON.parse(data.toString()) as ServerEvent;
    const i = waiters.findIndex((w) => w.type === ev.type);
    if (i >= 0) waiters.splice(i, 1)[0].resolve(ev);
    else queued.push(ev);
  });
  const next = <K extends ServerEvent['type']>(type: K): Promise<Extract<ServerEvent, { type: K }>> => {
    const i = queued.findIndex((e) => e.type === type);
    if (i >= 0) return Promise.resolve(queued.splice(i, 1)[0] as Extract<ServerEvent, { type: K }>);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for ${type}`)), 3000);
      waiters.push({ type, resolve: (e) => (clearTimeout(timer), resolve(e as Extract<ServerEvent, { type: K }>)) });
    });
  };
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  ws.send(JSON.stringify({ type: 'auth', token }));
  await next('hello');
  return {
    next,
    send: (ev: object) => ws.send(JSON.stringify(ev)),
    drain: () => queued.splice(0),
    peek: () => [...queued],
    close: () => ws.close(),
  };
}

let alice: SignInResponse;
let bob: SignInResponse;
let hq: string;
let projId: string;

const channelsOf = async (token: string, wid = hq) => (await call<Channel[]>('GET', `/api/workspaces/${wid}/channels`, token)).json;

test('rejects requests without a session', async () => {
  assert.equal((await call('GET', '/api/workspaces')).status, 401);
  assert.equal((await call('GET', '/api/workspaces', 'not-a-token')).status, 401);
});

test('sign-in joins the default workspace and its channels', async () => {
  alice = await signIn('Alice@Example.com', 'Alice');
  bob = await signIn('bob@example.com', 'Bob');
  assert.equal(alice.user.email, 'alice@example.com');
  const workspaces = (await call<Workspace[]>('GET', '/api/workspaces', alice.token)).json;
  assert.equal(workspaces.length, 1);
  hq = workspaces[0].id;
  const channels = await channelsOf(alice.token);
  assert.deepEqual(channels.filter((c) => c.isMember).map((c) => c.name).sort(), ['general', 'random']);
});

test('validates input', async () => {
  assert.equal((await call('POST', `/api/workspaces/${hq}/channels`, alice.token, { name: 'Bad Name!' })).status, 400);
  assert.equal((await call('POST', '/api/auth/signin', undefined, { email: 'nope' })).status, 400);
  assert.equal((await call('GET', '/api/channels/not-a-uuid/messages', alice.token)).status, 400);
});

test('workspaces are isolated until joined with the invite code', async () => {
  const acme = (await call<Workspace>('POST', '/api/workspaces', alice.token, { name: 'Acme' })).json;
  assert.equal(acme.role, 'owner');
  assert.equal((await call('GET', `/api/workspaces/${acme.id}/channels`, bob.token)).status, 404);
  const acmeGeneral = (await channelsOf(alice.token, acme.id)).find((c) => c.name === 'general')!;
  assert.equal((await call('GET', `/api/channels/${acmeGeneral.id}/messages`, bob.token)).status, 404);
  assert.equal((await call('POST', '/api/workspaces/join', bob.token, { code: 'wrong-code' })).status, 404);

  const joined = await call<Workspace>('POST', '/api/workspaces/join', bob.token, { code: acme.joinCode.toUpperCase() });
  assert.equal(joined.status, 200);
  assert.equal(joined.json.role, 'member');
  assert.equal((await channelsOf(bob.token, acme.id)).find((c) => c.name === 'general')?.isMember, true);
  const users = (await call<UserWithPresence[]>('GET', `/api/workspaces/${acme.id}/users`, bob.token)).json;
  assert.deepEqual(users.map((u) => u.name), ['Alice', 'Bob']);
});

test('public channel: join, post, realtime delivery, threads, reactions, unread', async () => {
  const created = await call<{ id: string }>('POST', `/api/workspaces/${hq}/channels`, alice.token, { name: 'proj', topic: 'Project' });
  assert.equal(created.status, 200);
  projId = created.json.id;
  assert.equal((await call('POST', `/api/workspaces/${hq}/channels`, alice.token, { name: 'PROJ' })).status, 409);

  assert.equal((await channelsOf(bob.token)).find((c) => c.id === projId)?.isMember, false);
  assert.equal((await call('POST', `/api/channels/${projId}/messages`, bob.token, { body: 'hi' })).status, 403);
  assert.equal((await call('POST', `/api/channels/${projId}/join`, bob.token)).status, 200);

  const bobSocket = await connect(bob.token);
  try {
    const posted = await call<Message>('POST', `/api/channels/${projId}/messages`, alice.token, { body: '  Hello Bob  ' });
    assert.equal(posted.status, 200);
    assert.equal(posted.json.body, 'Hello Bob');
    assert.equal((await bobSocket.next('message.created')).message.id, posted.json.id);

    const reply = await call<Message>('POST', `/api/channels/${projId}/messages`, alice.token, { body: 'in thread', parentId: posted.json.id });
    assert.equal(reply.json.parentId, posted.json.id);
    assert.equal((await bobSocket.next('message.created')).message.parentId, posted.json.id);
    assert.equal((await bobSocket.next('message.updated')).message.replyCount, 1);
    assert.equal((await call('POST', `/api/channels/${projId}/messages`, alice.token, { body: 'x', parentId: reply.json.id })).status, 400);

    assert.equal((await channelsOf(bob.token)).find((c) => c.id === projId)?.unread, 1);
    await call('POST', `/api/channels/${projId}/read`, bob.token);
    assert.equal((await channelsOf(bob.token)).find((c) => c.id === projId)?.unread, 0);

    const reacted = await call<Message>('POST', `/api/messages/${posted.json.id}/reactions`, bob.token, { emoji: '👍' });
    assert.deepEqual(reacted.json.reactions, [{ emoji: '👍', userIds: [bob.user.id] }]);
    const unreacted = await call<Message>('POST', `/api/messages/${posted.json.id}/reactions`, bob.token, { emoji: '👍' });
    assert.deepEqual(unreacted.json.reactions, []);
  } finally {
    bobSocket.close();
  }
});

test('mentions, edits and deletes', async () => {
  const msg = await call<Message>('POST', `/api/channels/${projId}/messages`, alice.token, { body: 'draft' });
  const edited = await call<Message>('PATCH', `/api/messages/${msg.json.id}`, alice.token, {
    body: `<@${bob.user.id}> please review, also <@00000000-0000-0000-0000-000000000000>`,
  });
  assert.equal(edited.status, 200);
  assert.ok(edited.json.editedAt);
  assert.deepEqual(edited.json.mentions, [bob.user.id]);
  assert.equal((await channelsOf(bob.token)).find((c) => c.id === projId)?.mentions, 1);
  assert.equal((await call('PATCH', `/api/messages/${msg.json.id}`, bob.token, { body: 'hijack' })).status, 403);
  assert.equal((await call('DELETE', `/api/messages/${msg.json.id}`, bob.token)).status, 403);

  const reply = await call<Message>('POST', `/api/channels/${projId}/messages`, bob.token, { body: 'on it', parentId: msg.json.id });
  assert.equal((await call('DELETE', `/api/messages/${msg.json.id}`, alice.token)).status, 200);
  let page = (await call<{ messages: Message[] }>('GET', `/api/channels/${projId}/messages`, alice.token)).json;
  const placeholder = page.messages.find((m) => m.id === msg.json.id);
  assert.equal(placeholder?.deleted, true);
  assert.equal(placeholder?.body, '');

  assert.equal((await call('DELETE', `/api/messages/${reply.json.id}`, bob.token)).status, 200);
  page = (await call<{ messages: Message[] }>('GET', `/api/channels/${projId}/messages`, alice.token)).json;
  assert.equal(page.messages.some((m) => m.id === msg.json.id), false);
});

test('file uploads attach to messages and download with signed links', async () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  const up = await upload(alice.token, projId, '../../evil/shot.png', 'image/png', png);
  assert.equal(up.status, 200);
  assert.equal(up.json.name, 'shot.png');
  assert.equal(up.json.isImage, true);

  const dl = await call('GET', up.json.url);
  assert.equal(dl.status, 200);
  assert.equal(dl.headers['content-type'], 'image/png');
  assert.deepEqual(dl.raw, png);
  assert.equal((await call('GET', up.json.url.replace(/sig=[^&]+/, 'sig=forged'))).status, 403);

  assert.equal((await call('POST', `/api/channels/${projId}/messages`, bob.token, { fileIds: [up.json.id] })).status, 400);
  const withFile = await call<Message>('POST', `/api/channels/${projId}/messages`, alice.token, { body: '', fileIds: [up.json.id] });
  assert.equal(withFile.status, 200);
  assert.equal(withFile.json.files[0].id, up.json.id);
  assert.equal((await call('POST', `/api/channels/${projId}/messages`, alice.token, { body: 'again', fileIds: [up.json.id] })).status, 400);
  assert.equal((await call('POST', `/api/channels/${projId}/messages`, alice.token, { body: '' })).status, 400);

  const html = await upload(alice.token, projId, 'page.html', 'text/html', Buffer.from('<script>alert(1)</script>'));
  const htmlDl = await call('GET', html.json.url);
  assert.equal(htmlDl.headers['content-type'], 'application/octet-stream');
  assert.match(String(htmlDl.headers['content-disposition']), /^attachment/);
});

test('search finds words by prefix, only in channels the user belongs to', async () => {
  await call('POST', `/api/channels/${projId}/messages`, alice.token, { body: 'Deploying the pipeline on Friday' });
  const secret = (await call<{ id: string }>('POST', `/api/workspaces/${hq}/channels`, alice.token, { name: 'secret', isPrivate: true })).json;
  await call('POST', `/api/channels/${secret.id}/messages`, alice.token, { body: 'Friday pipeline secret plan' });

  const forAlice = (await call<Message[]>('GET', `/api/workspaces/${hq}/search?q=${encodeURIComponent('pipel fri')}`, alice.token)).json;
  assert.equal(forAlice.length, 2);
  const forBob = (await call<Message[]>('GET', `/api/workspaces/${hq}/search?q=pipeline`, bob.token)).json;
  assert.deepEqual(forBob.map((m) => m.body), ['Deploying the pipeline on Friday']);
  assert.deepEqual((await call<Message[]>('GET', `/api/workspaces/${hq}/search?q=${encodeURIComponent('!!')}`, bob.token)).json, []);
});

test('private channels are invisible to non-members', async () => {
  const secret = (await channelsOf(alice.token)).find((c) => c.name === 'secret')!;
  assert.equal((await channelsOf(bob.token)).some((c) => c.id === secret.id), false);
  assert.equal((await call('GET', `/api/channels/${secret.id}/messages`, bob.token)).status, 404);
  assert.equal((await call('POST', `/api/channels/${secret.id}/join`, bob.token)).status, 404);
  assert.equal((await call('POST', `/api/channels/${secret.id}/messages`, bob.token, { body: 'x' })).status, 404);
});

test('direct messages are unique per pair', async () => {
  const first = (await call<{ id: string }>('POST', `/api/workspaces/${hq}/dms`, bob.token, { userId: alice.user.id })).json;
  const again = (await call<{ id: string }>('POST', `/api/workspaces/${hq}/dms`, alice.token, { userId: bob.user.id })).json;
  assert.equal(first.id, again.id);
  const dm = (await channelsOf(alice.token)).find((c) => c.id === first.id);
  assert.equal(dm?.isDm, true);
  assert.equal(dm?.dmUser?.id, bob.user.id);
});

test('huddles relay signalling only between participants', async () => {
  const carol = await signIn('carol@example.com', 'Carol');
  await call('POST', `/api/channels/${projId}/join`, carol.token);
  const a = await connect(alice.token);
  const b = await connect(bob.token);
  const c = await connect(carol.token);
  try {
    a.send({ type: 'huddle.join', channelId: projId });
    assert.deepEqual((await b.next('huddle.state')).participants, [alice.user.id]);
    const started = await b.next('huddle.started');
    assert.equal(started.by.id, alice.user.id);
    assert.equal(started.channelName, 'proj');
    assert.equal(started.workspaceId, hq);
    b.send({ type: 'huddle.join', channelId: projId });
    let state = await a.next('huddle.state');
    // Joining an existing huddle does not re-announce it.
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(a.peek().some((e) => e.type === 'huddle.started'), false);
    assert.equal(c.drain().filter((e) => e.type === 'huddle.started').length, 1);
    while (state.participants.length < 2) state = await a.next('huddle.state');
    assert.deepEqual(state.participants.sort(), [alice.user.id, bob.user.id].sort());
    assert.equal((await channelsOf(carol.token)).find((ch) => ch.id === projId)?.huddle.length, 2);

    a.send({ type: 'huddle.status', muted: true, sharing: false });
    let withStatus = await b.next('huddle.state');
    while (!withStatus.members.some((m) => m.userId === alice.user.id && m.muted)) withStatus = await b.next('huddle.state');
    assert.deepEqual(
      withStatus.members.find((m) => m.userId === alice.user.id),
      { userId: alice.user.id, muted: true, sharing: false },
    );

    const offer = { description: { type: 'offer', sdp: 'v=0' } };
    a.send({ type: 'huddle.signal', to: bob.user.id, data: offer });
    const got = await b.next('huddle.signal');
    assert.equal(got.from, alice.user.id);
    assert.deepEqual(got.data, offer);

    // Carol is not in the huddle: she can neither receive nor send signals.
    a.send({ type: 'huddle.signal', to: carol.user.id, data: offer });
    c.send({ type: 'huddle.signal', to: alice.user.id, data: offer });
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(c.drain().some((e) => e.type === 'huddle.signal'), false);
    assert.equal(a.drain().some((e) => e.type === 'huddle.signal'), false);

    a.close();
    state = await b.next('huddle.state');
    while (state.participants.length !== 1) state = await b.next('huddle.state');
    assert.deepEqual(state.participants, [bob.user.id]);
  } finally {
    b.close();
    c.close();
  }
});

test('websocket rejects a bad token', async () => {
  const ws = new WebSocket(`ws://${host}/ws`);
  await new Promise<void>((resolve) => ws.once('open', () => resolve()));
  ws.send(JSON.stringify({ type: 'auth', token: 'wrong' }));
  const code = await new Promise<number>((resolve) => ws.once('close', (c) => resolve(c)));
  assert.equal(code, 4401);
});

test('sign-in is rate limited per IP', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'relay-rl-'));
  const limited = await buildApp({ devSignin: true, filesDir: dir, limits: { signinPerMinute: 2 } });
  try {
    const statuses = [];
    for (let i = 0; i < 3; i++) {
      statuses.push((await call('POST', '/api/auth/signin', undefined, { email: `rl${i}@example.com` }, limited.app)).status);
    }
    assert.deepEqual(statuses, [200, 200, 429]);
  } finally {
    await limited.app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
