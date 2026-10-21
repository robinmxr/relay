#!/usr/bin/env node
// relay-chat: runs the Relay server (web client included) or opens the desktop app.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { version } = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));

const HELP = `relay-chat ${version}

Usage:
  relay-chat [serve] [options]   Start the server and web client
  relay-chat desktop [options]   Open the desktop app (starts a local server if none is running)

Options:
  --port <n>     HTTP port (default 4000, env PORT)
  --host <addr>  Address to listen on (default 127.0.0.1; 0.0.0.0 for your network, env HOST)
  --data <dir>   Where the database and uploads live (default ~/.relay-chat, env RELAY_DATA_DIR)
  --url <url>    desktop: server to open (default http://localhost:<port>, env RELAY_WEB_URL)
  -v, --version  Print the version
  -h, --help     Show this help

Settings can also go in a .env file in the current directory (see the README).`;

const args = process.argv.slice(2);
const command = args[0] && !args[0].startsWith('-') ? args.shift() : 'serve';
const flags = {};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '-h' || a === '--help') flags.help = true;
  else if (a === '-v' || a === '--version') flags.version = true;
  else if (['--port', '--host', '--data', '--url'].includes(a) && args[i + 1] !== undefined) flags[a.slice(2)] = args[++i];
  else fail(`Unknown option: ${a}`);
}
if (flags.version) {
  console.log(version);
  process.exit(0);
}
if (flags.help || !['serve', 'desktop'].includes(command)) {
  console.log(HELP);
  process.exit(flags.help ? 0 : 1);
}

function fail(msg) {
  console.error(`relay-chat: ${msg}\nRun relay-chat --help for usage.`);
  process.exit(1);
}

// .env in the working directory, then flags, then defaults. Already-set variables win.
try {
  process.loadEnvFile('.env');
} catch {
  // No .env here.
}
const env = process.env;
env.RELAY_CLI = '1';
if (flags.port) env.PORT = flags.port;
if (flags.host) env.HOST = flags.host;
if (flags.data) env.RELAY_DATA_DIR = flags.data;
const dataDir = path.resolve(env.RELAY_DATA_DIR || path.join(os.homedir(), '.relay-chat'));
env.PGLITE_DIR ??= path.join(dataDir, 'pglite');
env.FILES_DIR ??= path.join(dataDir, 'uploads');
env.WEB_DIST ??= path.join(pkgDir, 'dist/web');
const port = env.PORT || '4000';

async function serve() {
  await import('../dist/server.js');
  const host = env.HOST ?? '127.0.0.1';
  const shown = host === '0.0.0.0' || host === '::' ? 'localhost' : host;
  console.log(`\nRelay is running at http://${shown}:${port}  (data: ${env.DATABASE_URL ? 'Postgres' : dataDir})`);
}

async function reachable(url) {
  try {
    const res = await fetch(new URL('/api/health', url), { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function desktop() {
  let electron;
  try {
    electron = createRequire(import.meta.url)('electron');
  } catch {
    fail('the desktop app needs Electron, which was not installed. Reinstall relay-chat without --omit=optional.');
  }
  if (typeof electron !== 'string' || !existsSync(electron)) fail('Electron is installed but its app is missing. Reinstall relay-chat.');

  const url = flags.url || env.RELAY_WEB_URL || `http://localhost:${port}`;
  // Only a local URL gets a server started for it. A remote one goes straight to the app, which
  // reports a load failure and offers the certificate prompt for self-signed HTTPS; checking it
  // here with Node's fetch would reject that certificate before the prompt could appear.
  let startedServer = false;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname);
  if (local && !(await reachable(url))) {
    await serve();
    startedServer = true;
  }

  const childEnv = { ...env, RELAY_WEB_URL: url };
  delete childEnv.ELECTRON_RUN_AS_NODE; // set by some editors' terminals; it stops Electron opening windows
  const child = spawn(electron, [path.join(pkgDir, 'desktop')], { env: childEnv, stdio: 'inherit' });
  child.on('exit', (code) => {
    if (startedServer) process.exit(code ?? 0);
    process.exitCode = code ?? 0;
  });
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
}

await (command === 'desktop' ? desktop() : serve());
