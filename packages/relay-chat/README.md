# relay-chat

Self-hosted team chat: workspaces, channels and DMs, threads, reactions, @mentions, file uploads, search, and voice huddles with screen sharing. One package gives you the server, the web client, and a desktop app for macOS and Windows.

Needs Node 22 or later.

## Run it

```sh
npx relay-chat
```

Then open http://localhost:4000 and create your account.

Or install it once:

```sh
npm install -g relay-chat
relay-chat
```

To let other people on your network use it, listen on all addresses:

```sh
relay-chat --host 0.0.0.0
```

On start it prints the address to share, for example `https://192.168.21.155:4443`, which is the URL for everyone else on the network. Voice huddles need HTTPS for anyone not on `localhost` (see below).

## Signing in

Accounts use a password. The first person to open a fresh server creates their account; after that, signing in needs that password. There is no email delivery and no SSO — see **Security** below.

## Desktop app

```sh
relay-chat desktop                                  # starts a local server if none is running
relay-chat desktop --url https://chat.example.com   # or opens an existing server
```

The desktop app is Electron, downloaded for your platform (macOS or Windows) when you install. To skip it on a server, install with `npm install -g relay-chat --omit=optional`.

`--url` sets where the app loads the client from. It overrides the `relay.webUrl` value baked into the app, so it's the switch to use when the server moves.

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
- `RELAY_WEB_URL` sets where the desktop app loads the client from. It wins over the value baked into the app, so it's the effective setting in development.
- `RELAY_DEV_SIGNIN=true` re-opens passwordless email sign-in, for bootstrapping accounts that predate passwords. Off by default.

## HTTPS on your network, and the certificate prompt

Huddles need a secure origin, so anyone not on `localhost` needs the HTTPS listener. If its certificate is not one the system already trusts — which self-signed certificates never are — the desktop app refuses it, as it should.

When the app hits such a server it shows the certificate's SHA-256 fingerprint and asks whether to trust it:

1. Look at the fingerprint the server printed on start.
2. Compare it with the one in the dialog.
3. Only if they match exactly, choose **Trust and reload**.

The app then remembers that exact fingerprint for that server and accepts nothing else. A certificate that later changes is refused, because a changed certificate is exactly what an impersonation would look like. **Help → Server certificate…** shows what is pinned and lets you forget it, for when you legitimately re-key the server.

There is deliberately no "ignore certificate errors" setting: trusting one specific certificate and ignoring verification are different things.

## Security

Accounts use passwords: sign-up, sign-in, recovery codes, a session list, and a one-time password for resets handed over in person. There is no email delivery and no SSO, and `RELAY_DEV_SIGNIN=true` re-opens passwordless email sign-in for bootstrapping only — leave it off on a shared network. Run the server only on networks you trust.
