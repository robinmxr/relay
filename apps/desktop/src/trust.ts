// Certificate trust. The server may present a self-signed certificate, which Electron rejects
// by default. We accept exactly one thing: a certificate whose SHA-256 fingerprint matches a pin
// for that origin. There is deliberately no way to turn verification off wholesale — that is the
// difference between pinning and ignoring certificate errors.
//
// A pin comes from two places. The user may have approved one (settings.json), and the build may
// carry one for the server this build was made for. Both are honoured: the build's is what makes
// a fresh install work without asking anyone to read a fingerprint.

import { bakedPinFor, isTrusted, pinsFor, type BakedPin, type PinState } from './pins';
import { isBakedPinDropped, trustedFingerprint } from './settings';

/** What is known about one origin's trust, from the user's choices and the build. */
export function pinState(origin: string, baked: BakedPin | null): PinState {
  return {
    userPin: trustedFingerprint(origin),
    bakedPin: bakedPinFor(baked, origin),
    bakedDropped: isBakedPinDropped(origin),
  };
}

/**
 * Whether to accept a certificate for an origin that failed normal validation.
 * Only an exact match against one of that origin's pins passes.
 */
export function shouldTrust(origin: string, fingerprint: string | null, baked: BakedPin | null): boolean {
  return isTrusted(fingerprint, pinState(origin, baked));
}

/** The fingerprints that apply to an origin, whether the user approved them or the build carried them. */
export function pinsForOrigin(origin: string, baked: BakedPin | null): string[] {
  return pinsFor(pinState(origin, baked));
}
