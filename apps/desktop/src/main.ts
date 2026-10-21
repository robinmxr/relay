// Desktop shell. Like the reference app, it is a thin wrapper: the chat UI is the web client loaded
// from RELAY_WEB_URL, and this process only adds OS integration (notifications, dock badge,
// relay:// links) through a small, validated IPC surface.

import path from 'node:path';
import { connect as tlsConnect } from 'node:tls';
import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  ipcMain,
  Menu,
  Notification,
  session,
  shell,
  systemPreferences,
  type IpcMainInvokeEvent,
  type WebPreferences,
} from 'electron';
import { autoUpdater } from 'electron-updater';
import { fingerprintOf, format, matchesPin } from './certs';
import { forgetFingerprint, trustedFingerprint, trustFingerprint } from './settings';
import { shouldTrust } from './trust';

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
    buildMenu();
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
  // A rejected self-signed certificate shows up here first; offer to pin it, then reload.
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, _desc, validatedURL, isMainFrame) => {
    if (mainWindow && isMainFrame) void offerPin(mainWindow, validatedURL || WEB_URL, errorCode);
  });
  loadApp();
}

function configureSession(): void {
  const ses = session.defaultSession;

  // A self-signed certificate (the LAN phase) fails validation. Accept it only when its
  // SHA-256 fingerprint was pinned for that exact origin beforehand; fail closed otherwise.
  app.on('certificate-error', (event, _wc, url, error, certificate, callback) => {
    const origin = originOf(url);
    const fingerprint = fingerprintOf(certificate);
    if (origin && shouldTrust(origin, fingerprint)) {
      event.preventDefault();
      callback(true);
      return;
    }
    console.error(`Refused certificate for ${origin ?? url} (${error}); fingerprint ${fingerprint ? format(fingerprint) : 'unreadable'}`);
    callback(false);
  });

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

/**
 * App menu. On macOS this is the only menu, so it also carries the standard edit/window roles;
 * the certificate item is the escape hatch for a server that has been re-keyed.
 */
function buildMenu(): void {
  const isMac = process.platform === 'darwin';
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([{ role: 'appMenu' }] as Electron.MenuItemConstructorOptions[])
      : ([{ role: 'fileMenu' }] as Electron.MenuItemConstructorOptions[])),
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'Server certificate…',
          click: () => void showCertificate(),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** Shows what is pinned for the current server, and offers to forget it. */
async function showCertificate(): Promise<void> {
  const pinned = trustedFingerprint(APP_ORIGIN);
  const detail = pinned
    ? `${APP_ORIGIN}\n\nPinned certificate fingerprint:\n${format(pinned)}`
    : `${APP_ORIGIN}\n\nNo certificate is pinned. The server's certificate is checked normally.`;
  if (!pinned) {
    await dialog.showMessageBox({ type: 'info', title: 'Server certificate', message: 'Server certificate', detail });
    return;
  }
  const { response } = await dialog.showMessageBox({
    type: 'question',
    title: 'Server certificate',
    message: 'Server certificate',
    detail: `${detail}\n\nForget it? Relay will refuse this server until you approve its certificate again.`,
    buttons: ['Keep', 'Forget'],
    defaultId: 0,
    cancelId: 0,
  });
  if (response === 1) {
    forgetFingerprint(APP_ORIGIN);
    await dialog.showMessageBox({
      type: 'info',
      title: 'Server certificate',
      message: 'Server certificate',
      detail: 'Forgotten. Relay will refuse this server on the next reload until you approve its certificate again.',
    });
  }
}

/**
 * Loads the client, which may fail on a self-signed certificate. When the certificate is
 * unknown, show it and let the user pin it — then reload. Nothing is trusted implicitly.
 */
function loadApp(): void {
  const win = mainWindow;
  if (!win) return;
  win.loadURL(WEB_URL).catch(() => {
    // A rejected certificate surfaces as a load failure; the dialog is offered via did-fail-load.
  });
}

let offering = false;

async function offerPin(win: BrowserWindow, url: string, errorCode: number): Promise<void> {
  if (errorCode >= 0 || errorCode === -3) return; // Not a network/TLS failure, or just aborted.
  const origin = originOf(url);
  if (!origin || origin !== APP_ORIGIN || offering) return;
  offering = true;
  try {
    await explainOrOfferPin(win, origin);
  } finally {
    offering = false;
  }
}

async function explainOrOfferPin(win: BrowserWindow, origin: string): Promise<void> {
  const fingerprint = await fetchFingerprint(origin);
  const pinned = trustedFingerprint(origin);
  if (!fingerprint || (pinned && matchesPin(fingerprint, pinned))) {
    // Down, wrong address, or a failure that has nothing to do with the certificate.
    // Say so rather than leaving a blank window.
    const { response } = await dialog.showMessageBox(win, {
      type: 'error',
      title: 'Cannot reach the server',
      message: `Relay could not load ${origin}`,
      detail: 'Check that the server is running and that this computer is on the same network, then try again.',
      buttons: ['Close', 'Try again'],
      defaultId: 1,
      cancelId: 0,
    });
    if (response === 1) win.loadURL(WEB_URL);
    return;
  }
  if (pinned) {
    // A pinned certificate that stopped matching is a real error: never offer to accept it here.
    await dialog.showMessageBox(win, {
      type: 'error',
      title: 'Server certificate changed',
      message: 'The server is presenting a different certificate than the one you trusted',
      detail:
        `${origin}\n\nTrusted:\n${format(pinned)}\n\nNow presented:\n${format(fingerprint)}\n\n` +
        'This happens when the server is re-keyed, or when another machine is impersonating it. ' +
        'If the server was re-keyed, use Help → Server certificate… to forget the old one.',
      buttons: ['Close'],
    });
    return;
  }
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    title: 'Untrusted server certificate',
    message: 'This server uses a certificate that is not trusted',
    detail:
      `${origin}\n\nCertificate fingerprint (SHA-256):\n${format(fingerprint)}\n\n` +
      'Only continue if this matches the fingerprint printed by the server. Pinning the wrong one would let another machine impersonate it.',
    buttons: ['Cancel', 'Trust and reload'],
    defaultId: 0,
    cancelId: 0,
  });
  if (response === 1) {
    trustFingerprint(origin, fingerprint);
    win.loadURL(WEB_URL);
  }
}

/** The peer certificate's fingerprint for an origin, via a throwaway TLS connection. */
function fetchFingerprint(origin: string): Promise<string | null> {
  return new Promise((resolve) => {
    const url = new URL(origin);
    const socket = tlsConnect(
      { host: url.hostname, port: Number(url.port || 443), rejectUnauthorized: false, servername: url.hostname },
      () => {
        const cert = socket.getPeerCertificate();
        socket.destroy();
        resolve(cert && cert.raw ? fingerprintOf(cert.raw) : null);
      },
    );
    socket.on('error', () => resolve(null));
    socket.setTimeout(4000, () => {
      socket.destroy();
      resolve(null);
    });
  });
}


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
