import type { Channel, Message, User, UserWithPresence, Workspace } from '@relay/shared';
import type { ConnectionStatus } from './api';

export interface State {
  me: User;
  status: ConnectionStatus;
  workspaces: Workspace[];
  workspaceId: string | null;
  /** Members of the current workspace. */
  users: Record<string, UserWithPresence>;
  /** Channels of the current workspace. */
  channels: Channel[];
  activeId: string | null;
  threadId: string | null;
  /** Top-level messages per channel, oldest first. Missing = not loaded yet. */
  messages: Record<string, Message[]>;
  hasMore: Record<string, boolean>;
  /** Thread replies per parent message. Missing = not loaded yet. */
  replies: Record<string, Message[]>;
  typing: Record<string, Record<string, { name: string; until: number }>>;
}

export type Action =
  | { type: 'status'; status: ConnectionStatus }
  | { type: 'me'; me: User }
  | { type: 'workspaces'; workspaces: Workspace[] }
  | { type: 'switch-workspace'; workspaceId: string }
  | { type: 'channels'; workspaceId: string; channels: Channel[] }
  | { type: 'users'; workspaceId: string; users: UserWithPresence[] }
  | { type: 'presence'; userId: string; online: boolean }
  | { type: 'open'; channelId: string | null }
  | { type: 'thread'; id: string | null }
  | { type: 'messages'; channelId: string; messages: Message[]; hasMore: boolean; older?: boolean }
  | { type: 'replies'; parentId: string; replies: Message[] }
  | { type: 'upsert'; message: Message; created: boolean }
  | { type: 'remove'; id: string; channelId: string; parentId: string | null }
  | { type: 'read'; channelId: string }
  | { type: 'huddle'; channelId: string; participants: string[] }
  | { type: 'typing'; channelId: string; userId: string; name: string }
  | { type: 'typing-expire' };

const TYPING_MS = 4000;

export function initialState(me: User): State {
  return {
    me,
    status: 'connecting',
    workspaces: [],
    workspaceId: null,
    users: {},
    channels: [],
    activeId: null,
    threadId: null,
    messages: {},
    hasMore: {},
    replies: {},
    typing: {},
  };
}

function upsert(list: Message[] | undefined, m: Message): Message[] | undefined {
  if (!list) return undefined;
  const i = list.findIndex((x) => x.id === m.id);
  if (i < 0) return [...list, m];
  const copy = list.slice();
  copy[i] = m;
  return copy;
}

function withoutTyping(typing: State['typing'], channelId: string, userId: string): State['typing'] {
  const current = typing[channelId];
  if (!current?.[userId]) return typing;
  const { [userId]: _gone, ...rest } = current;
  return { ...typing, [channelId]: rest };
}

/** Copies the fresh name/avatar/status into message and reply snapshots, so an edit shows in chats already loaded. */
function refreshUser(state: State, user: User): Pick<State, 'messages' | 'replies'> {
  const patch = (list: Message[] | undefined): Message[] | undefined => {
    if (!list?.some((m) => m.user.id === user.id)) return list;
    return list.map((m) => (m.user.id === user.id ? { ...m, user: { ...m.user, name: user.name, avatarUrl: user.avatarUrl, status: user.status } } : m));
  };
  return {
    messages: Object.fromEntries(Object.entries(state.messages).map(([k, v]) => [k, patch(v) ?? v])),
    replies: Object.fromEntries(Object.entries(state.replies).map(([k, v]) => [k, patch(v) ?? v])),
  };
}

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'status':
      return { ...s, status: a.status };
    case 'me':
      return { ...s, me: a.me, ...refreshUser(s, a.me) };
    case 'workspaces':
      return { ...s, workspaces: a.workspaces };
    case 'switch-workspace':
      return a.workspaceId === s.workspaceId
        ? s
        : { ...s, workspaceId: a.workspaceId, channels: [], users: {}, activeId: null, threadId: null, typing: {} };
    case 'channels':
      if (a.workspaceId !== s.workspaceId) return s;
      return { ...s, channels: a.channels.map((c) => (c.id === s.activeId ? { ...c, unread: 0, mentions: 0 } : c)) };
    case 'users': {
      if (a.workspaceId !== s.workspaceId) return s;
      const users = Object.fromEntries(a.users.map((u) => [u.id, u]));
      // A refetched roster may carry new names or avatars; patch them into loaded messages.
      let patched: Pick<State, 'messages' | 'replies'> = { messages: s.messages, replies: s.replies };
      for (const u of a.users) {
        const before = s.users[u.id];
        if (before && (before.name !== u.name || before.avatarUrl !== u.avatarUrl)) {
          patched = refreshUser({ ...s, ...patched }, u);
        }
      }
      return { ...s, users, ...patched };
    }
    case 'presence': {
      const user = s.users[a.userId];
      return user ? { ...s, users: { ...s.users, [a.userId]: { ...user, online: a.online } } } : s;
    }
    case 'open':
      return a.channelId === s.activeId ? s : { ...s, activeId: a.channelId, threadId: null };
    case 'thread':
      return { ...s, threadId: a.id };
    case 'messages': {
      const existing = s.messages[a.channelId] ?? [];
      const messages = a.older ? [...a.messages, ...existing.filter((m) => !a.messages.some((n) => n.id === m.id))] : a.messages;
      return { ...s, messages: { ...s.messages, [a.channelId]: messages }, hasMore: { ...s.hasMore, [a.channelId]: a.hasMore } };
    }
    case 'replies':
      return { ...s, replies: { ...s.replies, [a.parentId]: a.replies } };
    case 'upsert': {
      const m = a.message;
      const typing = withoutTyping(s.typing, m.channelId, m.user.id);
      const fromOther = a.created && m.user.id !== s.me.id && m.channelId !== s.activeId;
      const mentionsMe = fromOther && m.mentions.includes(s.me.id);
      if (m.parentId) {
        const replies = upsert(s.replies[m.parentId], m);
        return {
          ...s,
          typing,
          replies: replies ? { ...s.replies, [m.parentId]: replies } : s.replies,
          channels: mentionsMe ? s.channels.map((c) => (c.id === m.channelId ? { ...c, mentions: c.mentions + 1 } : c)) : s.channels,
        };
      }
      const known = s.messages[m.channelId]?.some((x) => x.id === m.id) ?? false;
      const list = upsert(s.messages[m.channelId], m);
      const isNew = fromOther && !known;
      return {
        ...s,
        typing,
        messages: list ? { ...s.messages, [m.channelId]: list } : s.messages,
        channels: isNew
          ? s.channels.map((c) => (c.id === m.channelId ? { ...c, unread: c.unread + 1, mentions: c.mentions + (mentionsMe ? 1 : 0) } : c))
          : s.channels,
      };
    }
    case 'remove': {
      if (a.parentId) {
        const replies = s.replies[a.parentId];
        return replies ? { ...s, replies: { ...s.replies, [a.parentId]: replies.filter((m) => m.id !== a.id) } } : s;
      }
      const list = s.messages[a.channelId];
      return {
        ...s,
        threadId: s.threadId === a.id ? null : s.threadId,
        messages: list ? { ...s.messages, [a.channelId]: list.filter((m) => m.id !== a.id) } : s.messages,
      };
    }
    case 'read':
      return {
        ...s,
        channels: s.channels.map((c) => (c.id === a.channelId && (c.unread || c.mentions) ? { ...c, unread: 0, mentions: 0 } : c)),
      };
    case 'huddle':
      return { ...s, channels: s.channels.map((c) => (c.id === a.channelId ? { ...c, huddle: a.participants } : c)) };
    case 'typing':
      return {
        ...s,
        typing: { ...s.typing, [a.channelId]: { ...s.typing[a.channelId], [a.userId]: { name: a.name, until: Date.now() + TYPING_MS } } },
      };
    case 'typing-expire': {
      const now = Date.now();
      let changed = false;
      const typing: State['typing'] = {};
      for (const [channelId, people] of Object.entries(s.typing)) {
        typing[channelId] = {};
        for (const [userId, t] of Object.entries(people)) {
          if (t.until > now) typing[channelId][userId] = t;
          else changed = true;
        }
      }
      return changed ? { ...s, typing } : s;
    }
  }
}
