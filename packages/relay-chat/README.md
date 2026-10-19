# relay-chat

Self-hosted team chat: workspaces, channels and DMs, threads, reactions, @mentions, file uploads, search, and voice huddles with screen sharing. One package gives you the server, the web client, and a desktop app for macOS and Windows.

Needs Node 22 or later.

## Run it

```sh
npx relay-chat
```

Then open http://localhost:4000 and sign in with any email address.

Or install it once:

```sh
npm install -g relay-chat
relay-chat
```

To let other people on your network use it, listen on all addresses:

```sh
relay-chat --host 0.0.0.0
```

They open `http://<your-ip>:4000`. Voice huddles need HTTPS for anyone not on `localhost` (see below).

## Desktop app

```sh
relay-chat desktop                                  # starts a local server if none is running
relay-chat desktop --url https://chat.example.com   # or opens an existing server
```

The desktop app is Electron, downloaded for your platform (macOS or Windows) when you install. To skip it on a server, install with `npm install -g relay-chat --omit=optional`.

On macOS, an app started from a terminal uses that terminal's microphone permission. If huddles can't reach the microphone, allow your terminal under System Settings → Privacy & Security → Microphone.

## Options

| Flag | Env var | Default |
| --- | --- | --- |
| `--port <n>` | `PORT` | `4000` |
| `--host <addr>` | `HOST` | `127.0.0.1` |
| `--data <dir>` | `RELAY_DATA_DIR` | `~/.relay-chat` (database and uploads) |
| `--url <url>` | `RELAY_WEB_URL` | `http://localhost:<port>` (desktop only) |

Settings can also go in a `.env` file in the directory you run it from:

- `DATABASE_URL=postgres://user:pass@host:5432/db` uses Postgres instead of the built-in embedded database.
- `REDIS_URL=redis://localhost:6379` shares live events across several server processes.
- `RELAY_TLS_CERT`, `RELAY_TLS_KEY` (and optionally `RELAY_HTTPS_PORT`, default `4443`) add an HTTPS listener, which huddles need for users on other machines. A tool like [mkcert](https://github.com/FiloSottile/mkcert) can make the certificate.
- `RELAY_DEV_SIGNIN=false` turns off email-only sign-in.

## Security

Sign-in is development-only: anyone who can reach the server can sign in as any email address. Run it only on networks you trust.
