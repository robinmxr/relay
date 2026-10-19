// The `window.desktop` bridge that apps/desktop's preload exposes. Absent in a plain browser.

export interface DesktopBridge {
  platform: string;
  notify(opts: { title: string; body: string; channelId?: string }): Promise<boolean>;
  setBadge(count: number): Promise<void>;
  /** Calls back with relay:// links, including one that launched the app. Returns an unsubscribe. */
  onDeepLink(cb: (url: string) => void): () => void;
}

declare global {
  interface Window {
    desktop?: DesktopBridge;
  }
}

export const desktop: DesktopBridge | undefined = window.desktop;

export function parseDeepLink(url: string): string | null {
  const match = /^relay:\/\/channel\/([0-9a-f-]{36})\/?$/i.exec(url);
  return match ? match[1] : null;
}

export function canRequestBrowserNotifications(): boolean {
  return !desktop && 'Notification' in window && Notification.permission === 'default';
}

export function notify(title: string, body: string, channelId: string, onClick: (channelId: string) => void): void {
  if (desktop) {
    void desktop.notify({ title, body, channelId });
    return;
  }
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const n = new Notification(title, { body, tag: channelId });
  n.onclick = () => {
    window.focus();
    onClick(channelId);
    n.close();
  };
}
