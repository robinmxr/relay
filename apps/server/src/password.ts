import { createHash, randomInt, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem?: number },
) => Promise<Buffer>;

// ~100 ms on a laptop, which is the usual interactive-login target.
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 32;

/** `scrypt$N$r$p$salt$hash`; the salt and work factors travel with the hash. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password.normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const expected = Buffer.from(parts[5], 'base64');
  let key: Buffer;
  try {
    key = await scryptAsync(password.normalize('NFKC'), Buffer.from(parts[4], 'base64'), expected.length, {
      N: Number(parts[1]),
      r: Number(parts[2]),
      p: Number(parts[3]),
      maxmem: 64 * 1024 * 1024,
    });
  } catch {
    return false;
  }
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// No ambiguous characters, so it can be read off a screen or read aloud.
const CODE_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';

/** 20 characters, shown as `xxxxx-xxxxx-xxxxx-xxxxx`. Stored only as its hash. */
export function newRecoveryCode(): { code: string; hash: string } {
  let raw = '';
  for (let i = 0; i < 20; i++) raw += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return { code: raw.match(/.{5}/g)!.join('-'), hash: hashRecoveryCode(raw) };
}

/** Normalizes before hashing, so dashes, case and spacing never matter. */
export function hashRecoveryCode(input: string): string {
  const normalized = input.toLowerCase().replace(/[^a-z0-9]/g, '');
  return createHash('sha256').update(normalized).digest('hex');
}

// Uppercase, lowercase and digits, nothing ambiguous: an owner can read one aloud.
const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/** A one-time password an owner gives a member; sign-in forces the member to replace it. */
export function newTempPassword(): string {
  let out = '';
  for (let i = 0; i < 12; i++) out += TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)];
  return out;
}
