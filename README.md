# Relay

A Slack-style team chat. It has:

- workspaces, channels and direct messages
- threads, reactions and @mentions
- message editing and deleting
- file uploads
- search
- typing indicators, presence, unread and mention counts, and desktop notifications
- voice huddles with screen sharing

The layout follows what the reverse engineering of Slack's desktop app found (`~/Work/slack-re/REPORT.md`), built with its own code:

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

Sign in with any email; there's no password yet. Everyone lands in the "Relay HQ" workspace, whose invite code is `relay-hq`.

**Single port (production style):** `npm run build && npm start` serves the built client and the API together on http://localhost:4000.

### Database, Redis, files

- With no `DATABASE_URL`, the server uses PGlite, an embedded Postgres in `apps/server/.data/pglite`. Migrations in `apps/server/src/migrations/` run on start, each once.
- `npm run db:up` starts Postgres 16 and Redis 7 in Docker. Copy `.env.example` to `.env` to point the server at them. If port 5432 is already taken (e.g. by a locally installed Postgres), set `RELAY_PG_PORT` in `.env` and use the same port in `DATABASE_URL`.
- With `REDIS_URL` set, live events and presence are shared across server processes, and rate-limit counters are kept in Redis.
- Uploads are stored in `apps/server/.data/uploads` (set `FILES_DIR` to change it).

### Checks

```sh
npm test             # server integration tests (13)
npm run typecheck    # all workspaces
```

## Features and how they work

- **Workspaces.** Users are global; channels, DMs, members and search belong to a workspace. Creating one makes you its owner. Others join with its invite code: the person icon in the sidebar header shows the code, and the + in the left rail joins with it. Non-members get 404 for everything in a workspace.
- **Messages.**
  - Sending is a POST; the server stores the message and pushes `message.created` to every channel member's socket.
  - Authors can edit (`PATCH`) and delete (`DELETE`) their own messages. Deleting a message that has replies leaves a "This message was deleted" placeholder, so the thread stays readable.
- **Mentions.** Type `@` in the composer to pick a workspace member. Mentions are stored as `<@userId>` in the message text and indexed in `message_mentions`. They drive the red badge on a channel, and they also notify from inside threads.
- **Files.**
  - Up to 25 MB each and 10 per message. Uploads go to `/api/channels/:id/files` and attach when the message is posted.
  - Downloads use signed URLs (HMAC, valid 1–2 days), so `<img src>` works without an auth header.
  - Only PNG, JPEG, GIF and WebP display inline. Everything else downloads as `application/octet-stream`, so an uploaded HTML or SVG file never runs.
- **Search.** Postgres full-text search with prefix matching ("deplo fri" finds "Deploying on Friday"). It only covers channels you belong to in the current workspace.
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

These choices follow what the Slack analysis found:

- Every window gets frozen `webPreferences`: `contextIsolation`, `sandbox`, no `nodeIntegration`, no `<webview>`, and `app.enableSandbox()` is called.
- The preload exposes only `window.desktop` (`notify`, `setBadge`, `onDeepLink`), never `ipcRenderer`.
- Every IPC handler checks that the sender's origin is the app's origin and validates its arguments.
- Navigation to other origins is blocked. Links open in the system browser, and only for `https`, `http` and `mailto`.
- Permissions (notifications, mic, screen capture, clipboard write, fullscreen) are granted only to the app's origin. Screen share uses the macOS system picker on macOS 15 and later.
- **Fuses** are flipped at package time: RunAsNode, `NODE_OPTIONS` and inspector flags are off; cookie encryption, asar integrity validation and asar-only loading are on.

## Packaging the desktop app

```sh
npm run desktop:pack   # unpacked app in apps/desktop/release/ to try locally
npm run desktop:dist   # dmg + zip (mac), nsis (win), AppImage (linux)
```

- Set the server URL the app loads, and the update feed, in `apps/desktop/package.json` under `"relay"`, or with the `RELAY_WEB_URL` and `RELAY_UPDATE_URL` env vars.
- **Signing:** set `CSC_LINK` and `CSC_KEY_PASSWORD`. Without them, set `CSC_IDENTITY_AUTO_DISCOVERY=false` and the build is ad-hoc signed.
- **Notarization:** set `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`.
- **Auto-update:** host the files from `npm run dist` (including `latest-mac.yml`) at `updateUrl`. Packaged builds check on start and every 4 hours. macOS only applies updates to signed builds.
- In dev, the app keeps its data in `Relay Dev`, separate from an installed copy.

## npm package

`packages/relay-chat` publishes the server, the built web client and the desktop shell as one npm package, [`relay-chat`](packages/relay-chat/README.md): `npx relay-chat` runs the server, `relay-chat desktop` opens the desktop app (Electron, installed per platform).

```sh
cd packages/relay-chat
npm run build      # bundles apps/server with esbuild, copies migrations, apps/web/dist and apps/desktop/dist
npm pack           # inspect the tarball; npm publish also runs the build
```

## Known gaps

- **Sign-in is development-only.** Any email signs in. Disable it with `RELAY_DEV_SIGNIN=false` once real auth (magic links or SSO) exists.
- **Huddles live on one server process.** Huddle membership is kept in memory, so with several processes behind Redis, everyone in one huddle must reach the same process (sticky sessions). The mesh topology tops out around 5 or 6 people; beyond that it needs an SFU.
- **Presence after a crash.** If a server process crashes, its users read as offline after 60 seconds, but no "went offline" event is sent.
- **Files are on local disk.** There's no S3 backend yet, and files uploaded but never sent aren't cleaned up.
- **The UI has no automated tests.** Only the server is covered.
