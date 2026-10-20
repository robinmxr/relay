import { LIMITS, type ClientEvent, type FileInfo, type ServerEvent } from '@relay/shared';

const TOKEN_KEY = 'relay.token';

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string): void {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // Storage blocked: the session lasts until reload.
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      // Nothing stored.
    }
  },
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function authHeaders(): Record<string, string> {
  const token = tokenStore.get();
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function parse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? res.statusText);
  return data as T;
}

export async function api<T>(path: string, opts: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown } = {}): Promise<T> {
  const headers = authHeaders();
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  return parse<T>(res);
}

export async function uploadFile(channelId: string, file: File): Promise<FileInfo> {
  if (file.size > LIMITS.fileBytes) throw new ApiError(413, `${file.name} is larger than 25 MB`);
  const form = new FormData();
  form.append('file', file, file.name);
  const res = await fetch(`/api/channels/${channelId}/files`, { method: 'POST', headers: authHeaders(), body: form });
  return parse<FileInfo>(res);
}

export async function uploadAvatar(file: File): Promise<{ avatarUrl: string }> {
  if (file.size > 2 * 1024 * 1024) throw new ApiError(413, 'Avatars can be at most 2 MB');
  const form = new FormData();
  form.append('file', file, file.name);
  const res = await fetch('/api/me/avatar', { method: 'POST', headers: authHeaders(), body: form });
  return parse<{ avatarUrl: string }>(res);
}

export type ConnectionStatus = 'connecting' | 'online' | 'offline' | 'unauthorized';

/** WebSocket with auth-on-first-frame, keepalive, and reconnect with backoff. */
export class RealtimeClient {
  private ws: WebSocket | null = null;
  private retry = 0;
  private ready = false;
  private closed = false;
  private pingTimer: number | undefined;
  private retryTimer: number | undefined;

  constructor(
    private token: string,
    private onEvent: (ev: ServerEvent) => void,
    private onStatus: (status: ConnectionStatus) => void,
  ) {}

  connect(): void {
    if (this.closed) return;
    this.onStatus('connecting');
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;

    ws.onopen = () => this.raw({ type: 'auth', token: this.token });
    ws.onmessage = (msg) => {
      let ev: ServerEvent;
      try {
        ev = JSON.parse(msg.data as string) as ServerEvent;
      } catch {
        return;
      }
      if (ev.type === 'hello') {
        this.ready = true;
        this.retry = 0;
        this.onStatus('online');
      }
      this.onEvent(ev);
    };
    ws.onclose = (e) => {
      this.ready = false;
      window.clearInterval(this.pingTimer);
      if (this.closed) return;
      if (e.code === 4401) {
        this.onStatus('unauthorized');
        return;
      }
      this.onStatus('offline');
      const delay = Math.min(30_000, 500 * 2 ** this.retry++) + Math.random() * 500;
      this.retryTimer = window.setTimeout(() => this.connect(), delay);
    };

    window.clearInterval(this.pingTimer);
    this.pingTimer = window.setInterval(() => this.send({ type: 'ping' }), 25_000);
  }

  send(ev: ClientEvent): void {
    if (this.ready) this.raw(ev);
  }

  close(): void {
    this.closed = true;
    window.clearInterval(this.pingTimer);
    window.clearTimeout(this.retryTimer);
    this.ws?.close();
  }

  private raw(ev: ClientEvent): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(ev));
  }
}
