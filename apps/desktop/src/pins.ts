// Which certificate the shell accepts for an origin. Two sources: a pin the user approved
// (settings.json), and the pin baked in at build time for the server this build points at.
// Deliberately free of Electron imports so it can be tested on its own; the decisions here are
// security-relevant.

import { normalise } from './certs';

/** The build-time pin: the server this build was made for, and that server's certificate. */
export interface BakedPin {
  origin: string;
  fingerprint: string;
}

/** Everything known about one origin's trust. */
export interface PinState {
  /** The fingerprint the user approved for this origin, if any. */
  userPin: string | null;
  /** The build-time pin, when this origin is the one the build points at. */
  bakedPin: string | null;
  /** The user chose to stop using the build-time pin for this origin. */
  bakedDropped: boolean;
}

/** A SHA-256 fingerprint is 64 hex characters. Anything else is not one. */
export function isFingerprint(value: string): boolean {
  const hex = normalise(value);
  return hex.length === 64 && /^[0-9A-F]+$/.test(hex);
}

/**
 * The build-time pin, but only for the origin it was baked for. A pin is a statement about one
 * server, so it never travels to another origin.
 */
export function bakedPinFor(baked: BakedPin | null, origin: string): string | null {
  if (!baked || baked.origin !== origin) return null;
  const fingerprint = normalise(baked.fingerprint);
  return fingerprint.length ? fingerprint : null;
}

/**
 * Every pin that applies to an origin. A certificate the user approved and the one the build was
 * made with are both statements about the same server, so both are honoured: a pin left over from
 * an earlier certificate must not shadow a newer one, and a certificate the user approved by hand
 * must not be overridden by the build. Dropping the build-time pin leaves the user's alone.
 */
export function pinsFor(state: PinState): string[] {
  const pins: string[] = [];
  if (state.userPin) pins.push(normalise(state.userPin));
  if (!state.bakedDropped && state.bakedPin) {
    const baked = normalise(state.bakedPin);
    if (!pins.includes(baked)) pins.push(baked);
  }
  return pins;
}

/**
 * Whether to accept a certificate that failed normal validation. Passes only on an exact match
 * against one of the origin's pins. No pin, an unreadable certificate, or any other certificate
 * is refused.
 */
export function isTrusted(fingerprint: string | null, state: PinState): boolean {
  if (!fingerprint) return false;
  const hex = normalise(fingerprint);
  return pinsFor(state).some((pin) => pin === hex);
}
