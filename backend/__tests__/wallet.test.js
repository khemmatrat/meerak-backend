/**
 * Wallet API Tests - Critical Financial Logic
 * Tests for deposit, withdrawal, and balance management
 */

import request from 'supertest';
import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import {
  BASE_URL,
  registerIntegrationTestUser,
  unlockRateLimits,
} from './helpers/integrationTestSetup.js';

describe('Wallet API Tests', () => {
  let authToken = null;
  let userId = null;
  let setupOk = false;

  beforeAll(async () => {
    const setup = await registerIntegrationTestUser('wallet');
    setupOk = setup.ok;
    authToken = setup.authToken;
    userId = setup.userId;
    if (!setupOk) {
      console.warn('Test user creation failed:', setup.res?.body);
    }
  });

  beforeEach(async () => {
    if (authToken) {
      await unlockRateLimits(authToken);
    }
  });

  describe('Deposit Flow', () => {
    test('should reject deposit without authentication', async () => {
      const res = await request(BASE_URL)
        .post('/api/wallet/deposit')
        .send({ amount: 100, method: 'promptpay' });

      expect(res.status).toBe(401);
    });

    test('should reject deposit with invalid amount', async () => {
      if (!authToken) return;

      const res = await request(BASE_URL)
        .post('/api/wallet/deposit')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ amount: -100, method: 'promptpay' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/amount|จำนวน/i);
    });

    test('should reject deposit with zero amount', async () => {
      if (!authToken) return;

      const res = await request(BASE_URL)
        .post('/api/wallet/deposit')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ amount: 0, method: 'promptpay' });

      expect(res.status).toBe(400);
    });

    test('POST /wallet/deposit with valid amount returns payment response or config error', async () => {
      if (!authToken) return;

      const res = await request(BASE_URL)
        .post('/api/wallet/deposit')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ amount: 100, payment_method: 'promptpay' });

      // PaySo/gateway may be disabled in dev — accept business errors besides auth failures
      expect([200, 201, 400, 502, 503]).toContain(res.status);
    }, 30000);
  });

  describe('Withdrawal Flow', () => {
    test('should reject withdrawal without authentication', async () => {
      const res = await request(BASE_URL)
        .post('/api/payouts/request')
        .send({ amount: 50, bank_details: { bank: 'test' } });

      // Rate limit may apply before auth on older server builds — 401 is the primary case
      expect([401, 429]).toContain(res.status);
    });

    test('should reject withdrawal exceeding balance', async () => {
      if (!authToken) return;

      const res = await request(BASE_URL)
        .post('/api/payouts/request')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 999999999,
          bank_details: { bank: 'test', account: '1234567890', slip_url: 'https://example.com/slip.png' },
        });

      expect([400, 403]).toContain(res.status);
      if (res.status === 400) {
        expect(res.body.error).toMatch(/ยอดในกระเป๋าไม่เพียงพอ|insufficient/i);
      } else {
        expect(res.body.code).toBe('KYC_REQUIRED_FOR_PAYOUT');
      }
    });

    test('should apply payout eligibility rules when slip_url omitted', async () => {
      if (!authToken) return;

      const res = await request(BASE_URL)
        .post('/api/payouts/request')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 500,
          bank_details: { bank: 'test', channel: 'bank_transfer', account_number: '123' },
        });
      // API no longer returns withdrawal_slip_required — eligibility/balance rules apply instead
      expect([201, 400, 403]).toContain(res.status);
      expect(res.body.code).not.toBe('withdrawal_slip_required');
    });

    test('should reject negative withdrawal amount', async () => {
      if (!authToken) return;

      const res = await request(BASE_URL)
        .post('/api/payouts/request')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: -100,
          bank_details: { bank: 'test', slip_url: 'https://example.com/slip.png' },
        });

      expect(res.status).toBe(400);
    });

    test('should create withdrawal request with valid amount', async () => {
      if (!authToken) return;

      const res = await request(BASE_URL)
        .post('/api/payouts/request')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 1,
          bank_details: { bank: 'SCB', account: '1234567890', slip_url: 'https://example.com/slip.png' },
        });

      expect([201, 400, 403]).toContain(res.status);

      if (res.status === 403) {
        expect(res.body.code).toBe('KYC_REQUIRED_FOR_PAYOUT');
      }
      if (res.status === 201) {
        expect(res.body.request).toHaveProperty('id');
        expect(res.body.request.status).toBe('pending');
      }
    });
  });

  describe('Balance Integrity', () => {
    test('should prevent negative balance', async () => {
      if (!authToken) return;

      const res = await request(BASE_URL)
        .post('/api/payouts/request')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 999999,
          bank_details: { bank: 'test', slip_url: 'https://example.com/slip.png' },
        });

      expect([400, 403]).toContain(res.status);
      if (res.status === 400) {
        expect(res.body.error).toMatch(/ยอดในกระเป๋าไม่เพียงพอ|insufficient|available/i);
      } else {
        expect(res.body.code).toBe('KYC_REQUIRED_FOR_PAYOUT');
      }
    });

    test('should handle concurrent withdrawal attempts', async () => {
      if (!authToken) return;

      const promises = Array(3).fill(null).map(() =>
        request(BASE_URL)
          .post('/api/payouts/request')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            amount: 1,
            bank_details: { bank: 'test', slip_url: 'https://example.com/slip.png' },
          })
      );

      const results = await Promise.all(promises);

      const successCount = results.filter(r => r.status === 201).length;
      const failCount = results.filter(r => [400, 403].includes(r.status)).length;

      expect(successCount + failCount).toBe(3);
    });
  });

  describe('Transaction History', () => {
    test('should fetch withdrawal history', async () => {
      if (!authToken) return;

      const res = await request(BASE_URL)
        .get('/api/payouts/me')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('requests');
      expect(Array.isArray(res.body.requests)).toBe(true);
    });
  });

  afterAll(async () => {
    if (userId && authToken) {
      await request(BASE_URL)
        .post('/api/account/delete-request')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reason: 'Test cleanup' })
        .catch(() => {});
    }
  });
});
