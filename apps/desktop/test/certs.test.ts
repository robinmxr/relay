// Tests for the certificate fingerprint logic. These cover the security-relevant decisions in
// the desktop shell without needing Electron or a real certificate: comparing fingerprints is
// pure string work, and that is the part that must never accept the wrong certificate.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fingerprintOf, format, matchesPin, normalise } from '../src/certs';

// The fingerprint of the LAN certificate the shell is configured to load, as printed by the
// server and by `openssl x509 -noout -fingerprint -sha256`.
const SAMPLE = '7BC8EBA746019C0ECE649E0B466A2C50B155D7A3D5771911E95B8949FA6A1D51';

test('normalise strips formatting and uppercases', () => {
  assert.equal(normalise('7b:c8:eb:a7'), '7BC8EBA7');
  assert.equal(normalise('7B C8 EB A7'), '7BC8EBA7');
  assert.equal(normalise(''), '');
});

test('format renders colon-separated pairs', () => {
  assert.equal(format('7BC8EBA7'), '7B:C8:EB:A7');
  assert.equal(format(SAMPLE), '7B:C8:EB:A7:46:01:9C:0E:CE:64:9E:0B:46:6A:2C:50:B1:55:D7:A3:D5:77:19:11:E9:5B:89:49:FA:6A:1D:51');
});

test('format and normalise round-trip', () => {
  assert.equal(normalise(format(SAMPLE)), SAMPLE);
});

test('matchesPin accepts only the exact pinned fingerprint', () => {
  const other = 'AA'.repeat(32);
  assert.equal(matchesPin(SAMPLE, SAMPLE), true, 'same fingerprint');
  assert.equal(matchesPin(SAMPLE, other), false, 'different fingerprint');
  assert.equal(matchesPin(SAMPLE, null), false, 'nothing pinned');
  assert.equal(matchesPin(null, SAMPLE), false, 'unreadable certificate');
  assert.equal(matchesPin(null, null), false, 'neither');
});

test('matchesPin ignores formatting, never content', () => {
  assert.equal(matchesPin(SAMPLE, format(SAMPLE)), true, 'colons in the pin are irrelevant');
  assert.equal(matchesPin(SAMPLE, SAMPLE.toLowerCase()), true, 'case is irrelevant');
  // A single changed nibble is a different certificate, however it is formatted.
  const tampered = SAMPLE.slice(0, -1) + '2';
  assert.equal(matchesPin(SAMPLE, format(tampered)), false, 'a differing nibble is refused');
});

test('fingerprintOf returns null for anything that is not a certificate', () => {
  assert.equal(fingerprintOf('not a certificate'), null);
  assert.equal(fingerprintOf(Buffer.from('nope')), null);
  assert.equal(fingerprintOf({ data: 'bogus' }), null);
});
