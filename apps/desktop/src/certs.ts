// Certificate fingerprint comparison, deliberately free of Electron imports so it can be tested
// on its own. The decisions here are security-relevant: anything other than an exact match against
// a pinned fingerprint must be refused.

import { X509Certificate } from 'node:crypto';

/** Normalised SHA-256 fingerprint: bare uppercase hex, so formatting never affects comparison. */
export function normalise(fingerprint: string): string {
  return fingerprint.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
}

/** Normalised SHA-256 fingerprint of a certificate (PEM string, DER buffer, or `{ data }`), or null. */
export function fingerprintOf(certificate: { data: string } | string | Buffer): string | null {
  try {
    const x509 =
      typeof certificate === 'string'
        ? new X509Certificate(certificate)
        : Buffer.isBuffer(certificate)
          ? new X509Certificate(certificate)
          : new X509Certificate(`-----BEGIN CERTIFICATE-----\n${certificate.data}\n-----END CERTIFICATE-----\n`);
    return normalise(x509.fingerprint256);
  } catch {
    return null;
  }
}

/**
 * Whether to accept a certificate that failed normal validation. Passes only when it is
 * byte-for-byte the fingerprint pinned for that origin. A missing pin, an unreadable
 * certificate, or any other certificate is refused.
 */
export function matchesPin(fingerprint: string | null, pinned: string | null): boolean {
  if (!fingerprint || !pinned) return false;
  return normalise(pinned) === fingerprint;
}

/** Renders a fingerprint in the usual colon-separated pairs, for showing to a human. */
export function format(fingerprint: string): string {
  return normalise(fingerprint).replace(/(..)(?=.)/g, '$1:');
}
