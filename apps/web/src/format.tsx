import type { ReactNode } from 'react';
import { MENTION_RE, type Channel, type User } from '@relay/shared';

const AVATAR_COLORS = ['#8A4FA3', '#3B5BA9', '#B4532A', '#2C6E63', '#4B5563', '#9A3E8C', '#2F5BB7'];

export function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function dayKey(iso: string): string {
  return new Date(iso).toDateString();
}

export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

export function channelTitle(c: Channel, me: User): string {
  if (!c.isDm) return `#${c.name}`;
  const other = c.dmUser ?? me;
  return other.id === me.id ? `${other.name} (you)` : other.name;
}

const TOKEN_RE = /(<@[0-9a-f-]{36}>)|(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/gi;

/** Message text with mentions as chips and http(s) links clickable. Never renders HTML from the message. */
export function renderBody(text: string, users: Record<string, User>, meId: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN_RE)) {
    const i = match.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    if (match[1]) {
      const id = match[1].slice(2, -1).toLowerCase();
      const name = users[id]?.name ?? 'someone';
      out.push(
        <span key={i} className={`mention${id === meId ? ' me' : ''}`}>
          @{name}
        </span>,
      );
    } else {
      out.push(
        <a key={i} href={match[2]} target="_blank" rel="noopener noreferrer">
          {match[2]}
        </a>,
      );
    }
    last = i + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Plain-text preview, e.g. for notifications and search results. */
export function plainBody(text: string, users: Record<string, User>): string {
  return text.replace(MENTION_RE, (_, id: string) => `@${users[id.toLowerCase()]?.name ?? 'someone'}`);
}

/** Composer text uses "@Name"; the wire format uses "<@id>". `mentions` maps name → id. */
export function toWire(text: string, mentions: Map<string, string>): string {
  let out = text;
  const names = [...mentions.keys()].sort((a, b) => b.length - a.length);
  for (const name of names) {
    const re = new RegExp(`@${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}_])`, 'gu');
    out = out.replace(re, `<@${mentions.get(name)}>`);
  }
  return out;
}

export function toEditable(body: string, users: Record<string, User>): { text: string; mentions: Map<string, string> } {
  const mentions = new Map<string, string>();
  const text = body.replace(MENTION_RE, (token: string, id: string) => {
    const user = users[id.toLowerCase()];
    if (!user) return token;
    mentions.set(user.name, user.id);
    return `@${user.name}`;
  });
  return { text, mentions };
}
