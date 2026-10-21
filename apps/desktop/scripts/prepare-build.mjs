// Writes the build-time shell configuration into dist/relay.json, which the app reads at startup.
// This is how a release build points at a server, carries that server's certificate and names an
// update feed, without any of it being a code change: the values come from the environment.
//
//   RELAY_DESKTOP_WEB_URL          the server the app loads the client from
//   RELAY_DESKTOP_CERT_FINGERPRINT the SHA-256 fingerprint of that server's certificate (optional)
//   RELAY_DESKTOP_UPDATE_URL       the update feed (optional)
//
// Anything left unset falls back to the committed defaults in package.json.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(appDir, 'package.json'), 'utf8'));
const defaults = pkg.relay ?? {};

/** A SHA-256 fingerprint, as the server prints it: hex pairs, colons optional. */
function normaliseFingerprint(value) {
  const hex = value.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  if (hex.length !== 64) {
    throw new Error(`RELAY_DESKTOP_CERT_FINGERPRINT is not a SHA-256 fingerprint: expected 64 hex characters, got ${hex.length}`);
  }
  return hex;
}

const webUrl = process.env.RELAY_DESKTOP_WEB_URL || defaults.webUrl || '';
if (!webUrl) throw new Error('RELAY_DESKTOP_WEB_URL is not set and package.json has no relay.webUrl default');
const parsed = new URL(webUrl);
if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
  throw new Error(`RELAY_DESKTOP_WEB_URL must be an http(s) URL, got ${parsed.protocol}`);
}

const pinnedCert = process.env.RELAY_DESKTOP_CERT_FINGERPRINT
  ? normaliseFingerprint(process.env.RELAY_DESKTOP_CERT_FINGERPRINT)
  : (defaults.pinnedCert || '');
const updateUrl = process.env.RELAY_DESKTOP_UPDATE_URL ?? defaults.updateUrl ?? '';

const outDir = path.join(appDir, 'dist');
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'relay.json'), JSON.stringify({ webUrl, updateUrl, pinnedCert }, null, 2) + '\n');

console.log(`relay.json: ${webUrl}${pinnedCert ? ' (certificate pinned)' : ' (no certificate pinned)'}${updateUrl ? `, updates from ${updateUrl}` : ''}`);
