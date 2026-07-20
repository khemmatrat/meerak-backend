import test from 'node:test';
import assert from 'node:assert/strict';
import {
  stablePhoneFirebaseUid,
  signPhoneVerificationToken,
  verifyPhoneVerificationToken,
} from '../lib/phoneOtpAuth.js';

test('stablePhoneFirebaseUid is deterministic for normalized phone', () => {
  const a = stablePhoneFirebaseUid('0812345678');
  const b = stablePhoneFirebaseUid('0812345678');
  assert.equal(a, b);
  assert.match(a, /^ph_/);
});

test('phone verification JWT roundtrip', () => {
  const secret = 'test-secret-srp-w1';
  const phone = '66812345678';
  const token = signPhoneVerificationToken(phone, 'register', secret);
  const payload = verifyPhoneVerificationToken(token, phone, 'register', secret);
  assert.equal(payload.phone, phone);
  assert.equal(payload.purpose, 'register');
});

test('phone verification JWT rejects wrong phone', () => {
  const secret = 'test-secret-srp-w1';
  const token = signPhoneVerificationToken('66812345678', 'register', secret);
  assert.throws(() => verifyPhoneVerificationToken(token, '66899999999', 'register', secret));
});
