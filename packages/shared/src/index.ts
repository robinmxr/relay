// Types shared by the server and the web client: REST payloads and the WebSocket protocol.

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface UserWithPresence extends User {
  online: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  role: 'owner' | 'member';
  /** Share this so others can join with POST /api/workspaces/join. */
  joinCode: string;
}

export interface Channel {
  id: string;
  workspaceId: string;
  name: string;
  topic: string;
  isPrivate: boolean;
  isDm: boolean;
  /** Whether the viewer belongs to the channel. Public channels are visible without joining. */
  isMember: boolean;
  /** Top-level messages from others since the viewer last read the channel. */
  unread: number;
  /** Unread messages that @mention the viewer. */
  mentions: number;
  /** For a DM, the other person (the viewer for a DM with themself). */
  dmUser: User | null;
  /** User ids currently in this channel's huddle. */
  huddle: string[];
}

export interface Reaction {
  emoji: string;
  userIds: string[];
}

export interface FileInfo {
  id: string;
  name: string;
  mime: string;
  size: number;
  /** Signed download URL; works without an auth header, so it can be used in <img src>. */
  url: string;
  isImage: boolean;
}

export interface Message {
  id: string;
  channelId: string;
  parentId: string | null;
  user: User;
  /** Plain text. Mentions are written as <@userId>. Empty when deleted. */
  body: string;
  createdAt: string;
  editedAt: string | null;
  /** Deleted but kept because it has replies. */
  deleted: boolean;
  replyCount: number;
  lastReplyAt: string | null;
  reactions: Reaction[];
  mentions: string[];
  files: FileInfo[];
}

export interface MessagePage {
  messages: Message[];
  hasMore: boolean;
}

export interface SignInResponse {
  token: string;
  user: User;
}

export interface RtcConfig {
  iceServers: { urls: string | string[]; username?: string; credential?: string }[];
}

/** WebRTC signalling payload relayed between huddle participants. */
export interface HuddleSignal {
  description?: { type: 'offer' | 'answer' | 'pranswer' | 'rollback'; sdp?: string };
  candidate?: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null; usernameFragment?: string | null };
}

/** Server → client. */
export type ServerEvent =
  | { type: 'hello'; user: User }
  | { type: 'pong' }
  | { type: 'message.created'; message: Message }
  | { type: 'message.updated'; message: Message }
  | { type: 'message.deleted'; id: string; channelId: string; parentId: string | null }
  | { type: 'channels.changed'; workspaceId: string }
  | { type: 'workspaces.changed' }
  | { type: 'members.changed'; workspaceId: string }
  | { type: 'typing'; channelId: string; userId: string; name: string }
  | { type: 'presence'; userId: string; online: boolean }
  | { type: 'huddle.state'; channelId: string; participants: string[]; members: HuddleMember[] }
  /** Sent to the channel's other members when someone starts a huddle there (0 → 1 participants). */
  | { type: 'huddle.started'; channelId: string; workspaceId: string; channelName: string; isDm: boolean; by: User }
  | { type: 'huddle.signal'; channelId: string; from: string; data: HuddleSignal };

/** Client → server. The first frame on a socket must be `auth`. */
export type ClientEvent =
  | { type: 'auth'; token: string }
  | { type: 'ping' }
  | { type: 'typing'; channelId: string }
  | { type: 'huddle.join'; channelId: string }
  | { type: 'huddle.leave' }
  | { type: 'huddle.status'; muted: boolean; sharing: boolean }
  | { type: 'huddle.signal'; to: string; data: HuddleSignal };

export interface HuddleMember {
  userId: string;
  muted: boolean;
  sharing: boolean;
}

export const LIMITS = {
  messageBody: 8000,
  channelName: 80,
  topic: 250,
  pageSize: 50,
  fileBytes: 25 * 1024 * 1024,
  filesPerMessage: 10,
} as const;

export const MENTION_RE = /<@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})>/gi;

export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;
