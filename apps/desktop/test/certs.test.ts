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

// A real self-signed certificate (no key; it only needs to parse) and its fingerprint from
// `openssl x509 -noout -fingerprint -sha256`.
const REAL_PEM = `-----BEGIN CERTIFICATE-----
MIICDTCCAbQCCQClvN0aVOU0ZjAKBggqhkjOPQQDAjAVMRMwEQYDVQQDDApyZWxh
eS10ZXN0MB4XDTI2MTAyMTEwMDczNFoXDTM2MTAxODEwMDczNFowFTETMBEGA1UE
AwwKcmVsYXktdGVzdDCCAUswggEDBgcqhkjOPQIBMIH3AgEBMCwGByqGSM49AQEC
IQD/////AAAAAQAAAAAAAAAAAAAAAP///////////////zBbBCD/////AAAAAQAA
AAAAAAAAAAAAAP///////////////AQgWsY12Ko6k+ez671VdpiGvGUdBrDMU7D2
O848PifSYEsDFQDEnTYIhucEk2pmeOETnSa3gZ9+kARBBGsX0fLhLEJH+Lzm5WOk
QPJ3A32BLeszoPShOUXYmMKWT+NC4v4af5uO5+tKfA+eFivOM1drMV7Oy7ZAaDe/
UfUCIQD/////AAAAAP//////////vOb6racXnoTzucrC/GMlUQIBAQNCAASordpU
SPh+o2rPDSWHC0WEIgMcQIAnSRZXYKTfl6p7ct16MQ+6mC3FiYlOlQ/5nDtJ7lsh
vs9DNfXB1HVyc2WoMAoGCCqGSM49BAMCA0cAMEQCIC/xZ1FLxmDu8UqONr99VRdp
9kQhi5TWELiT0DhdD/GGAiBMKFUCwDpBHUtonZKdX2oTzAR2LKFx6JvN6/APhwsu
5w==
-----END CERTIFICATE-----
`;
const REAL_FINGERPRINT = '2D:E9:49:EA:1A:ED:5A:9B:C7:B3:2A:AE:72:DF:80:B4:D9:52:4A:58:5D:01:E6:F7:BD:45:C8:0C:8E:38:AB:70';

test("fingerprintOf reads Electron's certificate, whose data is a full PEM", () => {
  // Electron's certificate-error event hands over { data: <PEM with header lines> }.
  assert.equal(fingerprintOf({ data: REAL_PEM }), normalise(REAL_FINGERPRINT));
});

test('fingerprintOf gives the same answer for every shape of the same certificate', () => {
  const body = REAL_PEM.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  const der = Buffer.from(body, 'base64'); // What Node's getPeerCertificate().raw returns.
  const expected = normalise(REAL_FINGERPRINT);
  assert.equal(fingerprintOf(REAL_PEM), expected, 'PEM string');
  assert.equal(fingerprintOf(der), expected, 'DER buffer');
  assert.equal(fingerprintOf({ data: body }), expected, 'bare base64 body');
});

test('a certificate pinned from the prompt is accepted by the certificate check', () => {
  // The prompt pins what Node's TLS socket saw; the check later sees Electron's copy. They must agree.
  const body = REAL_PEM.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  const pinned = fingerprintOf(Buffer.from(body, 'base64'));
  assert.equal(matchesPin(fingerprintOf({ data: REAL_PEM }), pinned), true);
});
