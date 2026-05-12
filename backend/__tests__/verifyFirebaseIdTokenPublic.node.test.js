/**
 * รันด้วย: npm test (node --test) — ไม่ต้องมี Jest
 */
import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyFirebaseIdTokenWithPublicKeys,
  resetFirebaseCertCache,
} from '../lib/verifyFirebaseIdTokenPublic.js';

afterEach(() => {
  resetFirebaseCertCache();
});

describe('verifyFirebaseIdTokenWithPublicKeys', () => {
  test('โยนเมื่อไม่มี project id', async () => {
    await assert.rejects(
      () => verifyFirebaseIdTokenWithPublicKeys('abc', ''),
      (e) => /missing_project_id/.test(String(e?.message))
    );
    await assert.rejects(
      () => verifyFirebaseIdTokenWithPublicKeys('abc', null),
      (e) => /missing_project_id/.test(String(e?.message))
    );
  });

  test('โยนเมื่อ token ไม่ใช่ JWT ที่อ่านได้', async () => {
    await assert.rejects(() =>
      verifyFirebaseIdTokenWithPublicKeys('not-a-jwt', 'aqond-production')
    );
  });

  test('โยนเมื่อ kid ไม่ตรงกับใบรับรอง (mock fetch)', async () => {
    const origFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        someOtherKid:
          '-----BEGIN CERTIFICATE-----\nMIIBkTCB+wIJAKHhcgGUTbM1MA0GCSqGSIb3DQEBCwUAMBExDzANBgNVBAMMBnRlc3RjYTAeFw0yNTAxMDEwMDAwMDBaFw0zNTAxMDEwMDAwMDBaMBExDzANBgNVBAMMBnRlc3RjYTBcMA0GCSqGSIb3DQEBAQUAA0sAMEgCQQC5\n-----END CERTIFICATE-----\n',
      }),
      headers: new Map(),
    });
    try {
      const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'wantedKid' })).toString(
        'base64url'
      );
      const payload = Buffer.from(JSON.stringify({ sub: 'x' })).toString('base64url');
      const fakeToken = `${header}.${payload}.sig`;
      await assert.rejects(() =>
        verifyFirebaseIdTokenWithPublicKeys(fakeToken, 'aqond-production')
      );
    } finally {
      global.fetch = origFetch;
    }
  });

  test('ถ้ามี TEST_FIREBASE_ID_TOKEN + TEST_FIREBASE_PROJECT_ID token จริงควรตรวจผ่าน', async () => {
    const token = process.env.TEST_FIREBASE_ID_TOKEN;
    const projectId =
      process.env.TEST_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || '';
    if (!token || !projectId) {
      assert.ok(true, 'skip: ไม่ได้ตั้ง env สำหรับทดสอบแบบมี token จริง');
      return;
    }
    const payload = await verifyFirebaseIdTokenWithPublicKeys(token, projectId);
    assert.ok(payload?.sub || payload?.user_id, 'payload ต้องมี sub');
  });
});
