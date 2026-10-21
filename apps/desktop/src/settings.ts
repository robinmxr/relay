// Persistent shell settings. Only two things live here: where to load the client from, and
// which TLS certificate fingerprints have been explicitly trusted. Both are tiny, so this is a
// plain JSON file in userData rather than anything heavier.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

interface ShellSettings {
  /** Explicitly trusted server origins, mapped to the SHA-256 fingerprint of their certificate. */
  trustedCerts: Record<string, string>;
}

const EMPTY: ShellSettings = { trustedCerts: {} };

let cached: ShellSettings | null = null;

function file(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

export function load(): ShellSettings {
  if (cached) return cached;
  try {
    const parsed = JSON.parse(readFileSync(file(), 'utf8')) as Partial<ShellSettings>;
    cached = { trustedCerts: parsed.trustedCerts ?? {} };
  } catch {
    // Missing or unreadable: start clean rather than failing to boot.
    cached = { ...EMPTY, trustedCerts: {} };
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

export function trustFingerprint(origin: string, fingerprint: string): void {
  const current = load();
  save({ ...current, trustedCerts: { ...current.trustedCerts, [origin]: fingerprint } });
}

export function forgetFingerprint(origin: string): void {
  const current = load();
  const { [origin]: _removed, ...rest } = current.trustedCerts;
  save({ ...current, trustedCerts: rest });
}
