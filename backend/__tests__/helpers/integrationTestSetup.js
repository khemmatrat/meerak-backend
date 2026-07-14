/**
 * Shared setup for HTTP integration tests (Jest + supertest against TEST_API_URL).
 */
import request from 'supertest';
import { randomUUID } from 'node:crypto';

export const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3001';

export async function registerIntegrationTestUser(prefix = 'jest') {
  const suffix = Date.now();
  const res = await request(BASE_URL)
    .post('/api/auth/register')
    .send({
      phone: `08${String(Math.floor(10000000 + Math.random() * 90000000))}`,
      password: 'Test@1234',
      name: `${prefix} User ${suffix}`,
      role: 'provider',
      firebase_uid: `${prefix}_${suffix}_${randomUUID().slice(0, 8)}`,
    });

  const ok = res.status === 200 || res.status === 201;
  const authToken = res.body?.token || null;
  const userId = res.body?.user?.id || null;

  return { ok, authToken, userId, res };
}

export async function unlockRateLimits(authToken) {
  if (!authToken) return null;
  return request(BASE_URL)
    .post('/api/rate-limit/self-unlock')
    .set('Authorization', `Bearer ${authToken}`);
}
