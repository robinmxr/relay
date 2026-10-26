# Relay

Relay is becoming a centralized engineering workspace: chat that understands your repo, your CI, your services and your incidents. Pull requests become threads whose replies sync both ways with GitHub. Failing checks show up with the failing step and log excerpt. Incidents get a room with the runbook and the owners. Coding agents post their progress where the team can answer.

**Where it's going:** [`design/`](design/README.md) holds the product plan ([PLAN.md](design/PLAN.md)), a clickable prototype of the target product, and the research and decision docs for the next phases. Open the prototype with `open design/prototype/index.html`.

**What's in this repo today** is the chat foundation that plan builds on. It runs as a self-hosted service with no GitHub integration yet. It has:

- workspaces, channels and direct messages
- threads, reactions and @mentions
- message editing and deleting
- file uploads
- search
- typing indicators, presence, unread and mention counts, and desktop notifications
- profiles with display name, avatar and a status (emoji, text, optional expiry)
- people search, and clicking a name, avatar or @mention jumps into their DM
- voice huddles with screen sharing

It's built from scratch as four pieces:

| Piece | Here | What it does |
| --- | --- | --- |
| Desktop shell | `apps/desktop` (Electron) | A thin wrapper that loads the web client from a URL and adds OS integration: notifications, dock badge, `relay://` links, screen-share picker, auto-update. |
| Web client | `apps/web` (React + Vite) | The whole chat UI. It runs the same in a browser or inside the shell. |
| Server | `apps/server` (Fastify, WebSocket) | REST for reads and writes, one WebSocket per client for live events, and huddle signalling. |
| Shared types | `packages/shared` | Data types and the WebSocket protocol, used by both sides. |

## Run it

Needs Node 22.

```sh
npm install
npm run dev          # server on :4000, web client on http://localhost:5173
npm run desktop      # in a second terminal: the desktop app
```

Sign in with an email and password; accounts come with a one-time recovery code (there is no email server, so that code is the password-reset path). Accounts created before passwords existed start with the password `password` and are made to pick their own at first sign-in. The security tab in settings lists your active sessions — each with its last-seen time and user agent — and lets you revoke one, or all others at once. Everyone lands in the "Relay HQ" workspace, whose invite code is `relay-hq`.

**Single port (production style):** `npm run build && npm start` serves the built client and the API together on http://localhost:4000.

### On your local network

Until there's a deployed server, run it on this machine and point everyone at its LAN address:

```sh
# .env
HOST=0.0.0.0
RELAY_TLS_CERT=.data/tls/cert.pem
RELAY_TLS_KEY=.data/tls/key.pem
RELAY_HTTPS_PORT=4443
RELAY_WEB_URL=https://192.168.21.155:4443   # the fixed LAN address, and where the desktop app loads from
```

On start the server prints the address to share with people on your network, and the certificate's SHA-256 fingerprint. The HTTPS listener is what makes huddles work off `localhost`; the fingerprint is what the desktop app compares against when it asks to trust the server's self-signed certificate. `README` for [`relay-chat`](packages/relay-chat/README.md) covers the trust prompt from the user's side.

### Database, Redis, files

- With no `DATABASE_URL`, the server uses PGlite, an embedded Postgres in `apps/server/.data/pglite`. Migrations in `apps/server/src/migrations/` run on start, each once.
- `npm run db:up` starts Postgres 16 and Redis 7 in Docker. Copy `.env.example` to `.env` to point the server at them. If port 5432 is already taken (e.g. by a locally installed Postgres), set `RELAY_PG_PORT` in `.env` and use the same port in `DATABASE_URL`.
- With `REDIS_URL` set, live events and presence are shared across server processes, and rate-limit counters are kept in Redis.
- Uploads are stored in `apps/server/.data/uploads` (set `FILES_DIR` to change it).

### Checks

```sh
npm test             # server integration tests (20) and desktop unit tests (15)
npm run typecheck    # all workspaces
```

## Features and how they work

- **Workspaces.** Users are global; channels, DMs, members and search belong to a workspace. Creating one makes you its owner. Others join with its invite code: the invite panel in the sidebar header shows the code, and the + in the left rail joins with it. Non-members get 404 for everything in a workspace.
- **Channel and workspace admin.** The gear in a channel header opens channel settings: rename, topic, member list (any member may edit; DMs have none), adding and removing people from private channels, leaving, and archiving. Archived channels stay readable but refuse messages, edits, reactions and joins until restored; they're marked with 📦 in the sidebar and drop out of the browse list. The people icon in the sidebar footer opens the workspace roster page — searchable by name or email, with a Message button on every row that opens that person's DM. The owner can rename the workspace, remove members (which drops them from its channels) and reset a member's password: the server generates a one-time password to hand over in person, signs out all their sessions, kills their old recovery code and forces a new password at next sign-in.
- **Messages.**
  - Sending is a POST; the server stores the message and pushes `message.created` to every channel member's socket.
  - Authors can edit (`PATCH`) and delete (`DELETE`) their own messages. Deleting a message that has replies leaves a "This message was deleted" placeholder, so the thread stays readable.
- **Mentions.** Type `@` in the composer to pick a workspace member. Mentions are stored as `<@userId>` in the message text and indexed in `message_mentions`. They drive the red badge on a channel, and they also notify from inside threads.
- **Files.**
  - Up to 25 MB each and 10 per message. Uploads go to `/api/channels/:id/files` and attach when the message is posted.
  - Downloads use signed URLs (HMAC, valid 1–2 days), so `<img src>` works without an auth header.
  - Only PNG, JPEG, GIF and WebP display inline. Everything else downloads as `application/octet-stream`, so an uploaded HTML or SVG file never runs.
- **Search.** Postgres full-text search with prefix matching ("deplo fri" finds "Deploying on Friday"). It only covers channels you belong to in the current workspace.
- **Profile and settings.** Clicking a message author, an avatar or an @mention opens that person's DM; clicking your own name, avatar or mention opens your settings instead. Settings is a standalone page (deep-linkable at `/settings`, or ⌘, on macOS — Ctrl+, elsewhere) with sections in the URL: profile (display name, avatar upload/remove, and a status with emoji, text and an optional expiry — expired statuses are treated as unset), notifications (sound, desktop notifications, and whether to notify for every message or only mentions and DMs), appearance (theme: system, light or dark), and security (change password, recovery code, active sessions). Pages open over the running workspace, so a huddle keeps going while you're in them, and the browser's Back button (or Escape) returns you to chat — ⌘K / Ctrl+K jumps back to search. Preferences persist server-side in `/api/me/settings`, so they follow you across devices. Avatars live alongside file uploads and are served through signed URLs, like message attachments.
- **Huddles.**
  - Voice calls with screen sharing, over WebRTC. It's a mesh: each participant connects directly to each other one, which suits small groups.
  - The server only relays signalling, and only between members of the same huddle. Leaving, or closing the socket, removes you.
  - STUN defaults to Google's public server. For calls across strict NATs, set `RELAY_ICE_SERVERS` to a JSON list that includes your TURN server.
- **Rate limits.**
  - Per user, or per IP when signed out: 1200 requests a minute overall, 30 messages per 10 seconds per user, 30 uploads a minute.
  - Sign-in: 10 a minute per IP.
  - WebSocket: a socket that sends more than 50 frames a second is closed.
  - The values are in `apps/server/src/context.ts`.
- **Presence.** In-process by default. With Redis, each user has a sorted set of the server processes holding their sockets, refreshed every 20 seconds and expiring after 60.

### Desktop shell security

Hardening choices:

- Every window gets frozen `webPreferences`: `contextIsolation`, `sandbox`, no `nodeIntegration`, no `<webview>`, and `app.enableSandbox()` is called.
- The preload exposes only `window.desktop` (`notify`, `setBadge`, `onDeepLink`), never `ipcRenderer`.
- Every IPC handler checks that the sender's origin is the app's origin and validates its arguments.
- Navigation to other origins is blocked. Links open in the system browser, and only for `https`, `http` and `mailto`.
- Permissions (notifications, mic, screen capture, clipboard write, fullscreen) are granted only to the app's origin. Screen share uses the macOS system picker on macOS 15 and later.
- **Server certificates are pinned, not ignored.** A certificate that fails normal validation — the self-signed one on a LAN — is accepted only when its SHA-256 fingerprint exactly matches one of the pins for that origin: the one the user approved (in `userData/settings.json`), the one baked into the build for the server it points at, or both. Any other certificate is refused, including a pinned server whose certificate later changes. There is deliberately no "ignore certificate errors" switch. `Help → Server certificate…` shows and clears the pins.
- **Fuses** are flipped at package time: RunAsNode, `NODE_OPTIONS` and inspector flags are off; cookie encryption, asar integrity validation and asar-only loading are on.

## Packaging the desktop app

```sh
npm run desktop:pack   # unpacked app in apps/desktop/release/ to try locally
npm run desktop:dist   # dmg + zip (mac), nsis (win), AppImage (linux)
```

A release is three values, all of them environment variables, so the same source builds an app
for any server:

| Variable | What it is |
| --- | --- |
| `RELAY_DESKTOP_WEB_URL` | the server the app loads the client from |
| `RELAY_DESKTOP_CERT_FINGERPRINT` | that server's SHA-256 certificate fingerprint, if it is self-signed |
| `RELAY_DESKTOP_UPDATE_URL` | the update feed |

`apps/desktop/scripts/prepare-build.mjs` writes them to `apps/desktop/dist/relay.json`, which the
app reads at startup. It falls back to the committed defaults in `apps/desktop/package.json`
under `"relay"`, and `RELAY_WEB_URL` / `RELAY_UPDATE_URL` still override both at runtime — that is
the value `npm run desktop` uses in development.

**The baked certificate is what makes the install plug and play.** With the fingerprint in the
build, a fresh install connects to a self-signed server without anyone reading and approving a
fingerprint: the pin is checked exactly as a user-approved one is, and any other certificate is
still refused. A pin the user approved earlier never shadows the build's, so an app updated for a
re-keyed server keeps working. If the server is later re-keyed without a new build, the app says
the certificate changed and points at `Help → Server certificate…`, which drops the pins so the
new certificate can be approved by hand. When the server gets a certificate the system already
trusts, the pin never comes into it.

- **Signing:** set `CSC_LINK` and `CSC_KEY_PASSWORD`. Without them, set `CSC_IDENTITY_AUTO_DISCOVERY=false` and the build is ad-hoc signed — it runs, but macOS asks the user to allow it.
- **Notarization:** set `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`.
- **Auto-update:** `electron-builder.yml` names a generic feed, GitHub releases, which is what makes it write `latest-mac.yml` next to the artifacts. Point `RELAY_DESKTOP_UPDATE_URL` at it. Packaged builds check on start and every 4 hours. macOS only applies updates to signed builds.
- In dev, the app keeps its data in `Relay Dev`, separate from an installed copy.

### Releasing

`.github/workflows/release.yml` builds the three platforms and, on a tag, uploads the installers
and the update metadata to a GitHub release. Push a tag matching the version in
`apps/desktop/package.json`:

```sh
git tag v0.1.2 && git push origin v0.1.2
```

Set these as repository variables: `RELAY_DESKTOP_WEB_URL`, and optionally
`RELAY_DESKTOP_CERT_FINGERPRINT` and `RELAY_DESKTOP_UPDATE_URL`. Signing is optional: add
`MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `MAC_APPLE_ID`, `MAC_APPLE_APP_SPECIFIC_PASSWORD` and
`MAC_APPLE_TEAM_ID` as secrets for signed and notarized macOS builds, and `WIN_CSC_LINK` and
`WIN_CSC_KEY_PASSWORD` for Windows. Without them the builds are ad-hoc signed on macOS and
unsigned elsewhere, which is fine for testing but means users have to allow the app themselves.


## npm package

`packages/relay-chat` publishes the server, the built web client and the desktop shell as one npm package, [`relay-chat`](packages/relay-chat/README.md): `npx relay-chat` runs the server, `relay-chat desktop` opens the desktop app (Electron, installed per platform). Once Relay is hosted, the plan is for this package to become the `relay` CLI and SDK instead of a server installer.

```sh
cd packages/relay-chat
npm run build      # bundles apps/server with esbuild, copies migrations, apps/web/dist and apps/desktop/dist
npm pack           # inspect the tarball; npm publish also runs the build
```

## Known gaps

These are gaps in the current code. The plan for closing them, and for moving from a self-hosted install to one hosted multi-tenant service, is in [design/PLAN.md](design/PLAN.md) §9–11.

- **No developer integrations yet.** No GitHub App, PR threads, CI context, service catalog, CLI or MCP server. These are Phases 2–5 of the plan.
- **Passwords, not full auth.** Sign-up, sign-in, recovery codes, a session list (`/api/me/sessions`) and owner password resets (a one-time password handed over in person), but no email delivery and no SSO. `RELAY_DEV_SIGNIN=true` re-opens passwordless email sign-in, for bootstrapping only.
- **Huddles live on one server process.** Huddle membership is kept in memory, so with several processes behind Redis, everyone in one huddle must reach the same process (sticky sessions). The mesh topology tops out around 5 or 6 people; beyond that it needs an SFU.
- **Presence after a crash.** If a server process crashes, its users read as offline after 60 seconds, but no "went offline" event is sent.
- **Files are on local disk.** There's no S3 backend yet, and files uploaded but never sent aren't cleaned up.
- **The installers are not signed yet.** There is no Apple Developer ID or Windows certificate yet, so macOS asks users to allow the app the first time they open it, and auto-update does not apply to unsigned macOS builds. The release pipeline takes the credentials when they exist.
- **The UI has no automated tests.** The server is covered by integration tests, and the desktop shell's certificate-fingerprint logic by unit tests, but the React client is not covered.
