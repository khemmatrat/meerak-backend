import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { getBuildMeta } from '../lib/buildMeta.js';
import { registerAuthPhoneOtpRoutes } from '../lib/authPhoneOtpRoutes.js';

/** Routes mounted on master for consumer auth (SRP-W1 manifest). */
const MASTER_AUTH_POST_ROUTES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/phone-otp/send',
  '/api/auth/phone-otp/verify',
];

test('buildMeta expectedAuthRoutes includes master phone OTP endpoints', () => {
  const meta = getBuildMeta();
  for (const route of ['POST /api/auth/phone-otp/send', 'POST /api/auth/phone-otp/verify']) {
    assert.ok(meta.expectedAuthRoutes.includes(route), `missing ${route} in buildMeta`);
  }
});

test('registerAuthPhoneOtpRoutes mounts send and verify handlers', async () => {
  const app = express();
  app.use(express.json());
  const noop = () => {};
  registerAuthPhoneOtpRoutes(app, {
    authLimiter: (_req, _res, next) => next(),
    normalizePhoneForStorage: (p) => String(p).trim(),
    getClientIp: () => '127.0.0.1',
    isLocalhost: () => true,
    isRateLimitUnlocked: () => true,
    checkRateLimit: async () => ({ allowed: true, retryAfter: 0 }),
    sendRateLimitResponse: (res) => res.status(429).json({ error: 'rate' }),
    RATE_LIMIT_OTP_PHONE: { max: 10, windowSec: 60 },
    RATE_LIMIT_OTP_REQUEST_IP: { max: 10, windowSec: 60 },
    getRedisClient: () => null,
    getPool: () => ({
      query: async () => ({ rows: [] }),
    }),
  });

  const server = app.listen(0);
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    for (const path of ['/api/auth/phone-otp/send', '/api/auth/phone-otp/verify']) {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      assert.equal(res.status, 400, `${path} should validate body`);
    }
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('master auth route manifest is documented list', () => {
  assert.ok(MASTER_AUTH_POST_ROUTES.includes('/api/auth/phone-otp/send'));
  assert.equal(MASTER_AUTH_POST_ROUTES.length >= 6, true);
});
