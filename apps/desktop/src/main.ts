// Desktop shell. Like the reference app, it is a thin wrapper: the chat UI is the web client loaded
// from RELAY_WEB_URL, and this process only adds OS integration (notifications, dock badge,
// relay:// links) through a small, validated IPC surface.

import path from 'node:path';
import {
  app,
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  Notification,
  session,
  shell,
  systemPreferences,
  type IpcMainInvokeEvent,
  type WebPreferences,
} from 'electron';
import { autoUpdater } from 'electron-updater';

// In development, read the repo's .env like the server does. Variables already set win.
// Skipped under the npm launcher, which passes RELAY_WEB_URL itself.
if (!app.isPackaged && !process.env.RELAY_CLI) {
  try {
    process.loadEnvFile(path.join(__dirname, '../../../.env'));
  } catch {
    // No env file.
  }
}

// Build-time settings live in package.json "relay"; env vars override them.
const shellConfig = (require('../package.json') as { relay?: { webUrl?: string; updateUrl?: string } }).relay ?? {};
const WEB_URL = process.env.RELAY_WEB_URL || shellConfig.webUrl || 'http://localhost:5173';
const UPDATE_URL = process.env.RELAY_UPDATE_URL || shellConfig.updateUrl || '';
const APP_ORIGIN = new URL(WEB_URL).origin;
const PROTOCOL = 'relay';
const EXTERNAL_PROTOCOLS = new Set(['https:', 'http:', 'mailto:']);
const ALLOWED_PERMISSIONS = new Set(['notifications', 'media', 'display-capture', 'clipboard-sanitized-write', 'fullscreen']);
const UPDATE_CHECK_MS = 4 * 60 * 60 * 1000;

// Applied after any caller options so no window can loosen them.
const LOCKED_PREFERENCES: Readonly<WebPreferences> = Object.freeze({
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  webviewTag: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
});

let mainWindow: BrowserWindow | null = null;
let pendingLink: string | null = null;

app.enableSandbox();

// Keep a dev run (`electron .`) apart from an installed copy: separate data and a separate
// single-instance lock, so one never quits in favour of the other.
// The npm launcher (relay-chat desktop) gets its own profile too.
if (!app.isPackaged) app.setPath('userData', path.join(app.getPath('appData'), process.env.RELAY_CLI ? 'relay-chat' : 'Relay Dev'));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  registerProtocol();
  pendingLink = findLink(process.argv);

  app.on('second-instance', (_event, argv) => {
    const link = findLink(argv);
    if (link) deliverLink(link);
    focusMain();
  });

  // macOS delivers links here, including the one that launched the app.
  app.on('open-url', (event, url) => {
    event.preventDefault();
    if (isRelayLink(url)) deliverLink(url);
  });

  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (e) => e.preventDefault());
    contents.on('will-navigate', (e, url) => {
      if (originOf(url) !== APP_ORIGIN) {
        e.preventDefault();
        openExternal(url);
      }
    });
    contents.setWindowOpenHandler(({ url }) => {
      openExternal(url);
      return { action: 'deny' };
    });
  });

  app.whenReady().then(() => {
    configureSession();
    registerIpc();
    createMainWindow();
    setupUpdates();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
      else focusMain();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 520,
    title: 'Relay',
    show: false,
    backgroundColor: '#17212b',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), ...LOCKED_PREFERENCES },
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  void mainWindow.loadURL(WEB_URL);
}

function configureSession(): void {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, permission, callback, details) => {
    const allowed = originOf(details.requestingUrl) === APP_ORIGIN && ALLOWED_PERMISSIONS.has(permission);
    // macOS only shows its microphone prompt when asked; without it capture yields silence.
    const wantsMic = permission === 'media' && 'mediaTypes' in details && details.mediaTypes?.includes('audio');
    if (allowed && wantsMic && process.platform === 'darwin') {
      systemPreferences.askForMediaAccess('microphone').then(callback, () => callback(false));
      return;
    }
    callback(allowed);
  });
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => {
    return originOf(requestingOrigin) === APP_ORIGIN && ALLOWED_PERMISSIONS.has(permission);
  });

  // getDisplayMedia (huddle screen share). On macOS 15+ the system picker is shown; elsewhere the
  // handler shares the primary screen.
  ses.setDisplayMediaRequestHandler(
    (request, callback) => {
      if (originOf(request.frame?.url ?? request.securityOrigin) !== APP_ORIGIN) {
        callback({});
        return;
      }
      desktopCapturer
        .getSources({ types: ['screen'] })
        .then((sources) => callback(sources[0] ? { video: sources[0] } : {}))
        .catch(() => callback({}));
    },
    { useSystemPicker: true },
  );
}

/** Auto-update from a generic feed (latest-mac.yml etc. from `npm run dist`). Packaged builds only. */
function setupUpdates(): void {
  if (!app.isPackaged || !UPDATE_URL) return;
  autoUpdater.setFeedURL({ provider: 'generic', url: UPDATE_URL });
  const check = () => autoUpdater.checkForUpdatesAndNotify().catch((err) => console.error('Update check failed', err));
  void check();
  setInterval(check, UPDATE_CHECK_MS).unref();
}

/** Every handler checks that the call came from the app's own origin. */
function registerIpc(): void {
  ipcMain.handle('desktop:notify', (event, payload: unknown) => {
    if (!isTrustedSender(event)) return false;
    const opts = parseNotify(payload);
    if (!opts || !Notification.isSupported()) return false;
    const n = new Notification({ title: opts.title, body: opts.body });
    n.on('click', () => {
      focusMain();
      if (opts.channelId) mainWindow?.webContents.send('desktop:deep-link', `${PROTOCOL}://channel/${opts.channelId}`);
    });
    n.show();
    return true;
  });

  ipcMain.handle('desktop:set-badge', (event, count: unknown) => {
    if (!isTrustedSender(event)) return;
    const n = typeof count === 'number' && Number.isInteger(count) && count > 0 ? Math.min(count, 9999) : 0;
    app.setBadgeCount(n);
  });

  ipcMain.handle('desktop:take-pending-link', (event) => {
    if (!isTrustedSender(event)) return null;
    const link = pendingLink;
    pendingLink = null;
    return link;
  });
}

function parseNotify(payload: unknown): { title: string; body: string; channelId?: string } | null {
  if (!payload || typeof payload !== 'object') return null;
  const { title, body, channelId } = payload as Record<string, unknown>;
  if (typeof title !== 'string' || typeof body !== 'string') return null;
  if (channelId !== undefined && (typeof channelId !== 'string' || !/^[0-9a-f-]{36}$/i.test(channelId))) return null;
  return { title: title.slice(0, 200), body: body.slice(0, 1000), channelId: channelId as string | undefined };
}

function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  return originOf(event.senderFrame?.url) === APP_ORIGIN;
}

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function openExternal(url: string): void {
  try {
    const parsed = new URL(url);
    if (EXTERNAL_PROTOCOLS.has(parsed.protocol)) void shell.openExternal(parsed.toString());
  } catch {
    // Not a URL: ignore.
  }
}

function registerProtocol(): void {
  if (process.defaultApp && process.argv.length >= 2) {
    // Running from `electron .`: register the electron binary plus this app's path.
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }
}

function isRelayLink(url: string): boolean {
  return url.length < 2048 && url.startsWith(`${PROTOCOL}://`);
}

function findLink(argv: string[]): string | null {
  return argv.find(isRelayLink) ?? null;
}

/** Send now if the page is up, else hold it until the page asks (desktop:take-pending-link). */
function deliverLink(url: string): void {
  if (mainWindow && !mainWindow.webContents.isLoading()) mainWindow.webContents.send('desktop:deep-link', url);
  else pendingLink = url;
}

function focusMain(): void {
  if (!mainWindow) {
    if (app.isReady()) createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}
