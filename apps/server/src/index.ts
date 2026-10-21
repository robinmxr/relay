import { readFileSync } from 'node:fs';
import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https';
import { networkInterfaces } from 'node:os';
import { X509Certificate } from 'node:crypto';
import type { RtcConfig } from '@relay/shared';
import { buildApp } from './app';

// The npm launcher (packages/relay-chat) loads ./.env itself; don't look outside the working directory then.
for (const file of process.env.RELAY_CLI ? [] : ['.env', '../../.env']) {
  try {
    process.loadEnvFile(file);
    break;
  } catch {
    // No env file there.
  }
}

const env = process.env;
const port = Number(env.PORT ?? 4000);
const host = env.HOST ?? '127.0.0.1';

function iceServers(): RtcConfig | undefined {
  if (!env.RELAY_ICE_SERVERS) return undefined;
  return { iceServers: JSON.parse(env.RELAY_ICE_SERVERS) as RtcConfig['iceServers'] };
}

const { app } = await buildApp({
  databaseUrl: env.DATABASE_URL || undefined,
  dataDir: env.PGLITE_DIR ?? '.data/pglite',
  filesDir: env.FILES_DIR ?? '.data/uploads',
  redisUrl: env.REDIS_URL || undefined,
  devSignin: env.RELAY_DEV_SIGNIN === 'true',
  autoJoinDefault: env.RELAY_AUTO_JOIN_DEFAULT !== 'false',
  webDist: env.WEB_DIST ?? '../web/dist',
  rtc: iceServers(),
  logger: true,
});

// Optional HTTPS listener next to the HTTP one, for clients on other machines: browsers only allow
// the microphone and screen sharing on secure origins. It feeds the same app, so state is shared.
let https: HttpsServer | undefined;
if (env.RELAY_TLS_CERT && env.RELAY_TLS_KEY) {
  https = createHttpsServer({ cert: readFileSync(env.RELAY_TLS_CERT), key: readFileSync(env.RELAY_TLS_KEY) }, (req, res) =>
    app.routing(req, res),
  );
  https.on('upgrade', (req, socket, head) => app.server.emit('upgrade', req, socket, head));
}

const shutdown = async () => {
  https?.close();
  await app.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port, host });
if (https) {
  const httpsPort = Number(env.RELAY_HTTPS_PORT ?? 4443);
  await new Promise<void>((resolve) => https.listen(httpsPort, host, resolve));
  app.log.info(`https on ${host}:${httpsPort}`);
}
app.log.info(`database: ${env.DATABASE_URL ? 'postgres' : 'embedded PGlite'}, fan-out: ${env.REDIS_URL ? 'redis' : 'in-process'}`);

// Hand out the address other machines should use, and the certificate fingerprint to compare
// against in the desktop app. Without this, trusting a self-signed LAN certificate is guesswork.
if (host === '0.0.0.0' || host === '::') {
  const scheme = https ? 'https' : 'http';
  const shownPort = https ? Number(env.RELAY_HTTPS_PORT ?? 4443) : port;
  const addresses = localAddresses();
  if (addresses.length) {
    app.log.info(`share this address with people on your network: ${addresses.map((a) => `${scheme}://${a}:${shownPort}`).join(', ')}`);
  } else {
    app.log.info('listening on every interface, but no non-loopback IPv4 address was found');
  }
  if (https && env.RELAY_TLS_CERT) {
    app.log.info(`certificate SHA-256 fingerprint: ${certFingerprint(env.RELAY_TLS_CERT)}`);
  }
}

/** Non-loopback IPv4 addresses of this machine, for the address to share. */
function localAddresses(): string[] {
  const out: string[] = [];
  for (const addrs of Object.values(networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) out.push(addr.address);
    }
  }
  return out;
}

/** The SHA-256 fingerprint of a PEM certificate, formatted for a human to read out. */
function certFingerprint(file: string): string {
  try {
    const x509 = new X509Certificate(readFileSync(file));
    return x509.fingerprint256;
  } catch {
    return 'could not be read';
  }
}
