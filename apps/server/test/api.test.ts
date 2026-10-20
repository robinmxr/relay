import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import WebSocket from 'ws';
import type { Channel, FileInfo, MeResponse, Message, ServerEvent, SessionInfo, SignInResponse, UserSettings, UserWithPresence, Workspace } from '@relay/shared';
import { buildApp } from '../src/app';

let ctx: Awaited<ReturnType<typeof buildApp>>;
let host: string;
let filesDir: string;

before(async () => {
  filesDir = await mkdtemp(path.join(tmpdir(), 'relay-test-'));
  ctx = await buildApp({ devSignin: true, filesDir, limits: { signinPerMinute: 1000 } });
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

test('password accounts: signup, signin, sessions, change, recovery', async () => {
  const signed = await call<SignInResponse>('POST', '/api/auth/signup', undefined, {
    email: 'pat@example.com',
    name: 'Pat',
    password: 'correct-horse-battery',
  });
  assert.equal(signed.status, 200);
  assert.equal(signed.json.passwordSet, true);
  assert.ok(signed.json.recoveryCode);
  assert.equal((await call<MeResponse>('GET', '/api/me', signed.json.token)).json.passwordSet, true);

  assert.equal((await call('POST', '/api/auth/signup', undefined, { email: 'pat@example.com', password: 'correct-horse-battery' })).status, 409);
  assert.equal((await call('POST', '/api/auth/signup', undefined, { email: 'weak@example.com', password: 'short' })).status, 400);

  // Wrong, missing and unknown-email passwords all read the same.
  assert.equal((await call('POST', '/api/auth/signin', undefined, { email: 'pat@example.com', password: 'wrong' })).status, 401);
  assert.equal((await call('POST', '/api/auth/signin', undefined, { email: 'pat@example.com' })).status, 401);
  assert.equal((await call('POST', '/api/auth/signin', undefined, { email: 'nobody-here@example.com', password: 'whatever123' })).status, 401);

  const second = await call<SignInResponse>('POST', '/api/auth/signin', undefined, { email: 'pat@example.com', password: 'correct-horse-battery' });
  assert.equal(second.status, 200);

  const sessions = await call<SessionInfo[]>('GET', '/api/me/sessions', second.json.token);
  assert.equal(sessions.json.length, 2);
  const current = sessions.json.find((s) => s.current)!;
  const other = sessions.json.find((s) => !s.current)!;
  assert.ok(current.id);
  // The other session is the one from signup.
  assert.equal((await call('GET', '/api/workspaces', signed.json.token)).status, 200);
  assert.equal((await call('DELETE', `/api/me/sessions/${other.id}`, second.json.token)).status, 200);
  assert.equal((await call('GET', '/api/workspaces', signed.json.token)).status, 401);
  assert.equal((await call('DELETE', `/api/me/sessions/${other.id}`, second.json.token)).status, 404);

  // Changing the password signs other devices out and issues a fresh recovery code.
  const stale = await call<SignInResponse>('POST', '/api/auth/signin', undefined, { email: 'pat@example.com', password: 'correct-horse-battery' });
  assert.equal((await call('POST', '/api/me/password', second.json.token, { currentPassword: 'nope', password: 'brand-new-pass1' })).status, 403);
  const changed = await call<{ recoveryCode: string }>('POST', '/api/me/password', second.json.token, {
    currentPassword: 'correct-horse-battery',
    password: 'brand-new-pass1',
  });
  assert.equal(changed.status, 200);
  assert.notEqual(changed.json.recoveryCode, signed.json.recoveryCode);
  assert.equal((await call('GET', '/api/workspaces', stale.json.token)).status, 401);
  assert.equal((await call('GET', '/api/workspaces', second.json.token)).status, 200);

  // Recovery: the wrong code fails, the real one works and rotates the code.
  assert.equal(
    (await call('POST', '/api/auth/recover', undefined, { email: 'pat@example.com', code: 'not-the-code-1', password: 'recovered-pass-9' })).status,
    401,
  );
  const recovered = await call<SignInResponse>('POST', '/api/auth/recover', undefined, {
    email: 'pat@example.com',
    code: changed.json.recoveryCode,
    password: 'recovered-pass-9',
  });
  assert.equal(recovered.status, 200);
  assert.notEqual(recovered.json.recoveryCode, changed.json.recoveryCode);
  // Recovery kills every session it did not create, and the used code is spent.
  assert.equal((await call('GET', '/api/workspaces', second.json.token)).status, 401);
  assert.equal(
    (await call('POST', '/api/auth/recover', undefined, { email: 'pat@example.com', code: changed.json.recoveryCode, password: 'again-pass-10' })).status,
    401,
  );
  assert.equal((await call('POST', '/api/auth/signin', undefined, { email: 'pat@example.com', password: 'correct-horse-battery' })).status, 401);
  assert.equal((await call('POST', '/api/auth/signin', undefined, { email: 'pat@example.com', password: 'recovered-pass-9' })).status, 200);
});

test('without dev sign-in, accounts need passwords', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'relay-prod-'));
  const prod = await buildApp({ devSignin: false, filesDir: dir });
  try {
    // Email alone no longer creates or opens anything.
    assert.equal((await call('POST', '/api/auth/signin', undefined, { email: 'ghost@example.com' }, prod.app)).status, 401);
    assert.equal((await call('POST', '/api/auth/signin', undefined, { email: 'ghost@example.com', password: 'whatever123' }, prod.app)).status, 401);

    // Sign-up is the way in.
    const su = await call<SignInResponse>('POST', '/api/auth/signup', undefined, { email: 'ghost@example.com', password: 'ghost-pass-12' }, prod.app);
    assert.equal(su.status, 200);
    assert.equal(
      (await call('POST', '/api/auth/signin', undefined, { email: 'ghost@example.com', password: 'ghost-pass-12' }, prod.app)).status,
      200,
    );

    // The forced-change path: must_change lets the first password be replaced without asking for it back.
    await prod.ctx.db.query('update users set must_change = true where email = $1', ['ghost@example.com']);
    assert.equal((await call<MeResponse>('GET', '/api/me', su.json.token, undefined, prod.app)).json.mustChange, true);
    assert.equal((await call('POST', '/api/me/password', su.json.token, { password: 'chosen-pass-13' }, prod.app)).status, 200);
    assert.equal((await call<MeResponse>('GET', '/api/me', su.json.token, undefined, prod.app)).json.mustChange, false);
    // The starting password no longer works, the chosen one does.
    assert.equal((await call('POST', '/api/auth/signin', undefined, { email: 'ghost@example.com', password: 'ghost-pass-12' }, prod.app)).status, 401);
    assert.equal((await call('POST', '/api/auth/signin', undefined, { email: 'ghost@example.com', password: 'chosen-pass-13' }, prod.app)).status, 200);

    // An account that somehow lost its password is told how to get help, not let in.
    await prod.ctx.db.query('update users set password_hash = null where email = $1', ['ghost@example.com']);
    const refused = await call('POST', '/api/auth/signin', undefined, { email: 'ghost@example.com' }, prod.app);
    assert.equal(refused.status, 403);
  } finally {
    await prod.app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

async function uploadAvatar(token: string, mime: string, content: Buffer) {
  const boundary = '----relayavatar';
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="avatar"\r\nContent-Type: ${mime}\r\n\r\n`),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/me/avatar',
    headers: { authorization: `Bearer ${token}`, 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload,
  });
  return { status: res.statusCode, json: res.json() as { avatarUrl: string } };
}

test('profile: name, status, expiry, and the members hear about it', async () => {
  const s = await signIn('profile-test@example.com', 'Pat');

  // A rename shows up on /me and reaches other members over their sockets.
  const watcher = await signIn('profile-watch@example.com', 'Walt');
  const ws = await connect(watcher.token);
  const renamed = await call<MeResponse>('PATCH', '/api/me', s.token, { name: 'Patricia' });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.json.name, 'Patricia');
  await ws.next('members.changed');

  // A timed status lands in the workspace member list.
  const status = await call<MeResponse>('PATCH', '/api/me', s.token, { status: { emoji: '🎧', text: 'in a huddle', expiresInMinutes: 60 } });
  assert.equal(status.status, 200);
  assert.equal(status.json.status?.emoji, '🎧');
  assert.ok(status.json.status?.expiresAt);
  const users = await call<UserWithPresence[]>('GET', `/api/workspaces/${hq}/users`, s.token);
  assert.equal(users.json.find((u) => u.id === status.json.id)?.status?.text, 'in a huddle');

  // Once the expiry passes, the status reads back as unset.
  await ctx.ctx.db.query('update users set status_expires_at = now() - interval \'1 minute\' where id = $1', [status.json.id]);
  assert.equal((await call<MeResponse>('GET', '/api/me', s.token)).json.status, null);

  // Clearing works; nonsense is rejected.
  assert.equal((await call('PATCH', '/api/me', s.token, { status: null })).status, 200);
  assert.equal((await call('PATCH', '/api/me', s.token, { status: { emoji: '', text: 'x' } })).status, 400);
  assert.equal((await call('PATCH', '/api/me', s.token, {})).status, 400);
  ws.close();
});

test('avatars: upload, signed serve, replace, remove', async () => {
  const s = await signIn('avatar-test@example.com', 'Ava');
  const png = Buffer.from('89504e470d0a1a0a0000000d494844520000000100000001080600000037', 'hex');

  const up = await uploadAvatar(s.token, 'image/png', png);
  assert.equal(up.status, 200);
  assert.match(up.json.avatarUrl, /^\/api\/avatars\//);

  // The signed URL serves the image with no auth header, like <img> needs.
  const img = await ctx.app.inject({ method: 'GET', url: up.json.avatarUrl });
  assert.equal(img.statusCode, 200);
  assert.equal(img.headers['content-type'], 'image/png');
  assert.equal((await call<MeResponse>('GET', '/api/me', s.token)).json.avatarUrl, up.json.avatarUrl);
  const users = await call<UserWithPresence[]>('GET', `/api/workspaces/${hq}/users`, s.token);
  assert.equal(users.json.find((u) => u.email === s.user.email)?.avatarUrl, up.json.avatarUrl);

  // A tampered signature gets nowhere.
  const bad = await ctx.app.inject({ method: 'GET', url: up.json.avatarUrl.replace('sig=', 'sig=x') });
  assert.equal(bad.statusCode, 403);

  // Replacing changes the URL (cache-busting), so the browser fetches the new picture.
  const replaced = await uploadAvatar(s.token, 'image/png', png);
  assert.equal(replaced.status, 200);
  assert.notEqual(replaced.json.avatarUrl, up.json.avatarUrl);
  assert.equal((await call<MeResponse>('GET', '/api/me', s.token)).json.avatarUrl, replaced.json.avatarUrl);
  assert.equal((await ctx.app.inject({ method: 'GET', url: replaced.json.avatarUrl })).statusCode, 200);

  // Removing clears it everywhere.
  assert.equal((await call('DELETE', '/api/me/avatar', s.token)).status, 200);
  assert.equal((await call<MeResponse>('GET', '/api/me', s.token)).json.avatarUrl, null);
  assert.equal((await ctx.app.inject({ method: 'GET', url: up.json.avatarUrl })).statusCode, 404);

  // Only images, please.
  assert.equal((await uploadAvatar(s.token, 'text/plain', Buffer.from('hello'))).status, 400);
});

test('settings: defaults, partial patch, persistence', async () => {
  const s = await signIn('settings-test@example.com', 'Set');

  // A fresh account gets the defaults.
  const defaults = await call<UserSettings>('GET', '/api/me/settings', s.token);
  assert.equal(defaults.status, 200);
  assert.deepEqual(defaults.json, { theme: 'system', sound: true, desktopNotifications: true, notifyLevel: 'all' });

  // A partial patch keeps the rest, and is really stored rather than echoed.
  const patched = await call<UserSettings>('PATCH', '/api/me/settings', s.token, { theme: 'dark', notifyLevel: 'mentions' });
  assert.deepEqual(patched.json, { theme: 'dark', sound: true, desktopNotifications: true, notifyLevel: 'mentions' });
  assert.equal((await call<UserSettings>('GET', '/api/me/settings', s.token)).json.theme, 'dark');

  // Bad values are rejected.
  assert.equal((await call('PATCH', '/api/me/settings', s.token, { theme: 'neon' })).status, 400);
});

test('workspace admin: roles, rename, removal, owner password reset', async () => {
  const owner = await signIn('admin-owner@example.com', 'Olive');
  const member = await signIn('admin-member@example.com', 'Mo');
  const ws = (await call<Workspace>('POST', '/api/workspaces', owner.token, { name: 'Adminland' })).json;
  assert.equal((await call('POST', '/api/workspaces/join', member.token, { code: ws.joinCode })).status, 200);

  // Roles ride along in the member list.
  const users = await call<UserWithPresence[]>('GET', `/api/workspaces/${ws.id}/users`, member.token);
  assert.deepEqual(users.json.map((u) => [u.name, u.role]), [
    ['Mo', 'member'],
    ['Olive', 'owner'],
  ]);

  // Only the owner renames, and everyone sees it.
  assert.equal((await call('PATCH', `/api/workspaces/${ws.id}`, member.token, { name: 'Nope' })).status, 403);
  assert.equal((await call('PATCH', `/api/workspaces/${ws.id}`, owner.token, { name: 'Renamed Land' })).status, 200);
  assert.equal((await call<Workspace[]>('GET', '/api/workspaces', member.token)).json.find((w) => w.id === ws.id)?.name, 'Renamed Land');

  // Removal is owner-only, and nobody removes themselves: the member gets 403, the owner 400.
  assert.equal((await call('DELETE', `/api/workspaces/${ws.id}/members/${member.user.id}`, member.token)).status, 403);
  assert.equal((await call('DELETE', `/api/workspaces/${ws.id}/members/${owner.user.id}`, owner.token)).status, 400);

  // The member sets a password of their own first.
  assert.equal((await call('POST', '/api/me/password', member.token, { password: 'member-pass-1' })).status, 200);

  // The owner's reset: a one-time password, dead sessions, dead old password.
  const reset = await call<{ tempPassword: string }>('POST', `/api/workspaces/${ws.id}/members/${member.user.id}/reset-password`, owner.token);
  assert.equal(reset.status, 200);
  assert.match(reset.json.tempPassword, /^[A-Za-z0-9]{12}$/);
  assert.equal((await call('GET', '/api/me', member.token)).status, 401);
  assert.equal((await call('POST', '/api/auth/signin', undefined, { email: 'admin-member@example.com', password: 'member-pass-1' })).status, 401);
  const temp = await call<SignInResponse>('POST', '/api/auth/signin', undefined, { email: 'admin-member@example.com', password: reset.json.tempPassword });
  assert.equal(temp.status, 200);
  assert.equal((await call<MeResponse>('GET', '/api/me', temp.json.token)).json.mustChange, true);
  // Members cannot reset anyone.
  assert.equal(
    (await call('POST', `/api/workspaces/${ws.id}/members/${owner.user.id}/reset-password`, temp.json.token)).status,
    403,
  );

  // The owner removes the member; their channels go with them.
  assert.equal((await call('DELETE', `/api/workspaces/${ws.id}/members/${member.user.id}`, owner.token)).status, 200);
  assert.equal((await call('GET', `/api/workspaces/${ws.id}/channels`, temp.json.token)).status, 404);
});

test('channel admin: rename, archive, leave, private membership', async () => {
  const boss = await signIn('chan-boss@example.com', 'Carol');
  const friend = await signIn('chan-friend@example.com', 'Finn');
  const stranger = await signIn('chan-stranger@example.com', 'Sam');
  const ws = (await call<Workspace>('POST', '/api/workspaces', boss.token, { name: 'Channel Land' })).json;
  await call('POST', '/api/workspaces/join', friend.token, { code: ws.joinCode });
  await call('POST', '/api/workspaces/join', stranger.token, { code: ws.joinCode });

  // Private channels reveal nothing to non-members.
  const chan = (await call<{ id: string }>('POST', `/api/workspaces/${ws.id}/channels`, boss.token, { name: 'secrets', isPrivate: true })).json;
  assert.equal((await call('PATCH', `/api/channels/${chan.id}`, stranger.token, { name: 'peek' })).status, 404);
  assert.equal((await call('GET', `/api/channels/${chan.id}/members`, stranger.token)).status, 404);

  // Members are added one at a time; any member may add.
  assert.equal((await call('POST', `/api/channels/${chan.id}/members`, boss.token, { userId: friend.user.id })).status, 200);
  // The creator is the first member, so adding friend makes two.
  assert.equal((await call('GET', `/api/channels/${chan.id}/members`, friend.token)).json.length, 2);
  assert.equal((await call('POST', `/api/channels/${chan.id}/members`, friend.token, { userId: stranger.user.id })).status, 200);
  assert.equal((await call('GET', `/api/channels/${chan.id}/members`, stranger.token)).json.length, 3);

  // Rename by any member; duplicate names are refused.
  assert.equal((await call('PATCH', `/api/channels/${chan.id}`, friend.token, { name: 'lounge', topic: 'coffee' })).status, 200);
  await call('POST', `/api/workspaces/${ws.id}/channels`, boss.token, { name: 'cafe' });
  assert.equal((await call('PATCH', `/api/channels/${chan.id}`, boss.token, { name: 'cafe' })).status, 409);

  // Archiving keeps the channel readable but silent; restoring brings it back.
  assert.equal((await call('POST', `/api/channels/${chan.id}/messages`, friend.token, { body: 'before' })).status, 200);
  assert.equal((await call('POST', `/api/channels/${chan.id}/archive`, friend.token, { archived: true })).status, 200);
  assert.equal((await call('POST', `/api/channels/${chan.id}/messages`, friend.token, { body: 'after' })).status, 403);
  assert.equal((await channelsOf(friend.token, ws.id)).find((c) => c.id === chan.id)?.archivedAt !== null, true);
  assert.equal((await call('POST', `/api/channels/${chan.id}/archive`, boss.token, { archived: false })).status, 200);
  assert.equal((await call('POST', `/api/channels/${chan.id}/messages`, friend.token, { body: 'after' })).status, 200);

  // Leaving is yours to do; removing someone else needs to be from a private channel.
  assert.equal((await call('DELETE', `/api/channels/${chan.id}/members/me`, friend.token)).status, 200);
  assert.equal((await call('GET', `/api/channels/${chan.id}/messages`, friend.token)).status, 404);
  assert.equal((await call('DELETE', `/api/channels/${chan.id}/members/${stranger.user.id}`, boss.token)).status, 200);
  assert.equal((await call('GET', `/api/channels/${chan.id}/messages`, stranger.token)).status, 404);

  // DMs refuse rename, archive and leave alike.
  const dm = (await call<{ id: string }>('POST', `/api/workspaces/${ws.id}/dms`, boss.token, { userId: friend.user.id })).json;
  assert.equal((await call('PATCH', `/api/channels/${dm.id}`, boss.token, { name: 'x' })).status, 400);
  assert.equal((await call('POST', `/api/channels/${dm.id}/archive`, boss.token, { archived: true })).status, 400);
  assert.equal((await call('DELETE', `/api/channels/${dm.id}/members/me`, boss.token)).status, 400);
});
