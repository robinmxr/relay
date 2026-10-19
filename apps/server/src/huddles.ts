import type { WebSocket } from 'ws';
import type { HuddleMember } from '@relay/shared';

interface Entry {
  socket: WebSocket;
  muted: boolean;
  sharing: boolean;
}

/**
 * Huddle membership, tied to the socket that joined so a second tab does not count, and a closed
 * socket leaves. Media flows peer to peer (WebRTC); the server only relays signalling and each
 * member's mute/share status.
 * Kept in process memory: with several server processes, a huddle's members must share a process.
 */
export class Huddles {
  private byChannel = new Map<string, Map<string, Entry>>();
  private byUser = new Map<string, string>();

  participants(channelId: string): string[] {
    return [...(this.byChannel.get(channelId)?.keys() ?? [])];
  }

  members(channelId: string): HuddleMember[] {
    return [...(this.byChannel.get(channelId)?.entries() ?? [])].map(([userId, e]) => ({ userId, muted: e.muted, sharing: e.sharing }));
  }

  channelOf(userId: string): string | null {
    return this.byUser.get(userId) ?? null;
  }

  /** Returns the channel the user left by joining, if any. */
  join(channelId: string, userId: string, socket: WebSocket): string | null {
    const previous = this.byUser.get(userId) ?? null;
    if (previous) this.remove(previous, userId);
    let members = this.byChannel.get(channelId);
    if (!members) {
      members = new Map();
      this.byChannel.set(channelId, members);
    }
    members.set(userId, { socket, muted: false, sharing: false });
    this.byUser.set(userId, channelId);
    return previous && previous !== channelId ? previous : null;
  }

  /** Updates the status of the user's huddle membership held by `socket`. Returns its channel. */
  setStatus(userId: string, socket: WebSocket, status: { muted: boolean; sharing: boolean }): string | null {
    const channelId = this.byUser.get(userId);
    const entry = channelId ? this.byChannel.get(channelId)?.get(userId) : undefined;
    if (!channelId || !entry || entry.socket !== socket) return null;
    entry.muted = status.muted;
    entry.sharing = status.sharing;
    return channelId;
  }

  /** Leaves the user's huddle. With `socket`, only if that socket is the one that joined. Returns the channel left. */
  leave(userId: string, socket?: WebSocket): string | null {
    const channelId = this.byUser.get(userId);
    if (!channelId) return null;
    if (socket && this.byChannel.get(channelId)?.get(userId)?.socket !== socket) return null;
    this.remove(channelId, userId);
    return channelId;
  }

  private remove(channelId: string, userId: string): void {
    const members = this.byChannel.get(channelId);
    members?.delete(userId);
    if (members && members.size === 0) this.byChannel.delete(channelId);
    this.byUser.delete(userId);
  }
}
