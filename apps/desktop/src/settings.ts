// Persistent shell settings. Only two things live here: which TLS certificate fingerprints have
// been explicitly trusted, and which origins the user chose to stop trusting the build-time pin
// for. Both are tiny, so this is a plain JSON file in userData rather than anything heavier.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

interface ShellSettings {
  /** Explicitly trusted server origins, mapped to the SHA-256 fingerprint of their certificate. */
  trustedCerts: Record<string, string>;
  /** Origins where the user chose not to use the pin that was baked in at build time. */
  droppedCerts: Record<string, true>;
}

const EMPTY: ShellSettings = { trustedCerts: {}, droppedCerts: {} };

let cached: ShellSettings | null = null;

function file(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

export function load(): ShellSettings {
  if (cached) return cached;
  try {
    const parsed = JSON.parse(readFileSync(file(), 'utf8')) as Partial<ShellSettings>;
    cached = { trustedCerts: parsed.trustedCerts ?? {}, droppedCerts: parsed.droppedCerts ?? {} };
  } catch {
    // Missing or unreadable: start clean rather than failing to boot.
    cached = { ...EMPTY, trustedCerts: {}, droppedCerts: {} };
  }
  return cached;
}

function save(next: ShellSettings): void {
  cached = next;
  try {
    mkdirSync(path.dirname(file()), { recursive: true });
    writeFileSync(file(), JSON.stringify(next, null, 2) + '\n');
  } catch (err) {
    console.error('Could not save shell settings', err);
  }
}

/** The fingerprint trusted for an origin, if any. */
export function trustedFingerprint(origin: string): string | null {
  return load().trustedCerts[origin] ?? null;
}

/**
 * Records the fingerprint the user approved for an origin. It takes precedence over the pin that
 * was baked into the build, so a user who approves a certificate themselves is trusted on their
 * own word from then on.
 */
export function trustFingerprint(origin: string, fingerprint: string): void {
  const current = load();
  const dropped = { ...current.droppedCerts };
  delete dropped[origin];
  save({ ...current, trustedCerts: { ...current.trustedCerts, [origin]: fingerprint }, droppedCerts: dropped });
}

/**
 * Forgets every pin for an origin: the one the user approved, and the one the build was made
 * with. Nothing is trusted for it afterwards, so the next connection has to be approved by hand.
 */
export function forgetFingerprint(origin: string): void {
  const current = load();
  const { [origin]: _removed, ...rest } = current.trustedCerts;
  save({ ...current, trustedCerts: rest, droppedCerts: { ...current.droppedCerts, [origin]: true } });
}

/**
 * Whether the user chose to stop using the pin that was baked in for this origin. Used when the
 * server is re-keyed: the build-time pin no longer matches, and the user needs a way to approve
 * the new certificate without waiting for a new build.
 */
export function isBakedPinDropped(origin: string): boolean {
  return load().droppedCerts[origin] === true;
}
