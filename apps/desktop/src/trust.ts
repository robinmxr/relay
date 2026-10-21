// Certificate trust for the LAN phase. The server may present a self-signed certificate, which
// Electron rejects by default. We accept exactly one thing: a certificate whose SHA-256 fingerprint
// matches one the user approved for that origin beforehand. There is deliberately no way to turn
// verification off wholesale — that is the difference between pinning and ignoring certificate errors.

import { matchesPin } from './certs';
import { trustedFingerprint } from './settings';

/**
 * Whether to accept a certificate for an origin that failed normal validation.
 * Only an exact match against that origin's pinned fingerprint passes.
 */
export function shouldTrust(origin: string, fingerprint: string | null): boolean {
  return matchesPin(fingerprint, trustedFingerprint(origin));
}
