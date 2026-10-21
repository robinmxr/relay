// Tests for the pin decision: which certificate the shell accepts for an origin. The build-time
// pin is what lets a fresh install connect to a self-signed server without asking anyone to read
// a fingerprint, so the rules around it have to be exactly right: it applies to one origin only,
// it never shadows a pin the user approved, and dropping it leaves the user's alone.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bakedPinFor, isFingerprint, isTrusted, pinsFor, type BakedPin } from '../src/pins';

const SAMPLE = '7BC8EBA746019C0ECE649E0B466A2C50B155D7A3D5771911E95B8949FA6A1D51';
const OTHER = 'AA'.repeat(32);
const ORIGIN = 'https://192.168.21.155:4443';

const baked: BakedPin = { origin: ORIGIN, fingerprint: SAMPLE };

test('a build-time pin applies only to the origin it was baked for', () => {
  assert.equal(bakedPinFor(baked, ORIGIN), SAMPLE);
  assert.equal(bakedPinFor(baked, 'https://chat.example.com'), null);
  assert.equal(bakedPinFor(baked, 'http://192.168.21.155:4443'), null, 'the scheme is part of the origin');
  assert.equal(bakedPinFor(null, ORIGIN), null, 'no pin baked in');
});

test('the pins for an origin are the user\'s and the build\'s', () => {
  assert.deepEqual(pinsFor({ userPin: null, bakedPin: SAMPLE, bakedDropped: false }), [SAMPLE]);
  assert.deepEqual(pinsFor({ userPin: OTHER, bakedPin: SAMPLE, bakedDropped: false }), [OTHER, SAMPLE]);
  assert.deepEqual(pinsFor({ userPin: null, bakedPin: SAMPLE, bakedDropped: true }), [], 'the build pin was dropped');
  assert.deepEqual(pinsFor({ userPin: OTHER, bakedPin: SAMPLE, bakedDropped: true }), [OTHER], 'the user pin stays');
  assert.deepEqual(pinsFor({ userPin: null, bakedPin: null, bakedDropped: false }), []);
});

test('the same pin from both sources is listed once', () => {
  assert.deepEqual(pinsFor({ userPin: SAMPLE, bakedPin: SAMPLE, bakedDropped: false }), [SAMPLE]);
});

test('isTrusted accepts any pinned certificate, and nothing else', () => {
  const state = { userPin: null, bakedPin: SAMPLE, bakedDropped: false };
  assert.equal(isTrusted(SAMPLE, state), true, 'the baked certificate');
  assert.equal(isTrusted(OTHER, state), false, 'any other certificate');
  assert.equal(isTrusted(null, state), false, 'an unreadable certificate');
  assert.equal(isTrusted(SAMPLE, { userPin: null, bakedPin: null, bakedDropped: false }), false, 'nothing pinned');
  assert.equal(isTrusted(SAMPLE, { userPin: null, bakedPin: SAMPLE, bakedDropped: true }), false, 'the pin was dropped');
});

test('a pin left over from an earlier certificate does not shadow a newer one', () => {
  // The user approved a certificate, the server was re-keyed, and the build carries the new one.
  // The old pin must not stop the new certificate from being accepted.
  const state = { userPin: OTHER, bakedPin: SAMPLE, bakedDropped: false };
  assert.equal(isTrusted(SAMPLE, state), true, 'the newer certificate');
  assert.equal(isTrusted(OTHER, state), true, 'the one the user approved');
});

test('a build-time pin is matched however it is written', () => {
  const state = { userPin: null, bakedPin: SAMPLE.toLowerCase(), bakedDropped: false };
  assert.equal(isTrusted(SAMPLE, state), true, 'case is irrelevant');
  const withColons = { userPin: null, bakedPin: SAMPLE.replace(/(..)(?=.)/g, '$1:'), bakedDropped: false };
  assert.equal(isTrusted(SAMPLE, withColons), true, 'colons are irrelevant');
});

test('isFingerprint accepts a SHA-256 fingerprint and nothing else', () => {
  assert.equal(isFingerprint(SAMPLE), true);
  assert.equal(isFingerprint(SAMPLE.toLowerCase()), true);
  assert.equal(isFingerprint(SAMPLE.replace(/(..)(?=.)/g, '$1:')), true, 'colons are allowed');
  assert.equal(isFingerprint('7BC8EBA7'), false, 'too short');
  assert.equal(isFingerprint(SAMPLE + 'AA'), false, 'too long');
  assert.equal(isFingerprint(''), false);
});
