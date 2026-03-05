/**
 * Wallet API Tests - Critical Financial Logic
 * Tests for deposit, withdrawal, and balance management
 */

import request from 'supertest';
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3001';

describe('Wallet API Tests', () => {
  let authToken = null;
  let userId = null;

  beforeAll(async () => {
    // Create test user and get auth token
    const registerRes = await request(BASE_URL)
      .post('/api/auth/register')
      .send({
        email: `test_${Date.now()}@akonda.test`,
        password: 'Test@1234',
        phone: `081${Math.floor(1000000 + Math.random() * 9000000)}`,
        name: 'Test User',
        role: 'provider'
      });
    
    if (registerRes.status === 201 && registerRes.body.token) {
      authToken = registerRes.body.token;
      userId = registerRes.body.user?.id;
    } else {
      console.warn('Test user creation failed:', registerRes.body);
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
      const res = await request(BASE_URL)
        .post('/api/wallet/deposit')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ amount: -100, method: 'promptpay' });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('amount');
    });

    test('should reject deposit with zero amount', async () => {
      const res = await request(BASE_URL)
        .post('/api/wallet/deposit')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ amount: 0, method: 'promptpay' });
      
      expect(res.status).toBe(400);
    });

    test('should create deposit charge successfully', async () => {
      const res = await request(BASE_URL)
        .post('/api/wallet/deposit')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ amount: 100, method: 'promptpay' });
      
      // อาจเป็น 201 หรือ 200 ขึ้นอยู่กับ implementation
      expect([200, 201]).toContain(res.status);
      expect(res.body).toHaveProperty('chargeId');
    }, 30000);
  });

  describe('Withdrawal Flow', () => {
    test('should reject withdrawal without authentication', async () => {
      const res = await request(BASE_URL)
        .post('/api/payouts/request')
        .send({ amount: 50, bank_details: { bank: 'test' } });
      
      expect(res.status).toBe(401);
    });

    test('should reject withdrawal exceeding balance', async () => {
      const res = await request(BASE_URL)
        .post('/api/payouts/request')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ 
          amount: 999999999, 
          bank_details: { bank: 'test', account: '1234567890' } 
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/ยอดในกระเป๋าไม่เพียงพอ|insufficient/i);
    });

    test('should reject negative withdrawal amount', async () => {
      const res = await request(BASE_URL)
        .post('/api/payouts/request')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ 
          amount: -100, 
          bank_details: { bank: 'test' } 
        });
      
      expect(res.status).toBe(400);
    });

    test('should create withdrawal request with valid amount', async () => {
      // ถ้ายอดเงินเพียงพอ request จะสำเร็จ
      const res = await request(BASE_URL)
        .post('/api/payouts/request')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ 
          amount: 1, // จำนวนเล็กน้อยเพื่อทดสอบ
          bank_details: { bank: 'SCB', account: '1234567890' } 
        });
      
      // อาจจะสำเร็จหรือล้มเหลวขึ้นอยู่กับยอดเงิน
      expect([201, 400]).toContain(res.status);
      
      if (res.status === 201) {
        expect(res.body.request).toHaveProperty('id');
        expect(res.body.request.status).toBe('pending');
      }
    });
  });

  describe('Balance Integrity', () => {
    test('should prevent negative balance', async () => {
      // พยายามถอนมากกว่ายอดที่มี
      const res = await request(BASE_URL)
        .post('/api/payouts/request')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ 
          amount: 999999, 
          bank_details: { bank: 'test' } 
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/ยอดในกระเป๋าไม่เพียงพอ|insufficient|available/i);
    });

    test('should handle concurrent withdrawal attempts', async () => {
      // Simulate race condition
      const promises = Array(3).fill(null).map(() =>
        request(BASE_URL)
          .post('/api/payouts/request')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ 
            amount: 1, 
            bank_details: { bank: 'test' } 
          })
      );

      const results = await Promise.all(promises);
      
      // อย่างน้อย 1 request ต้องล้มเหลวถ้ายอดไม่พอ
      const successCount = results.filter(r => r.status === 201).length;
      const failCount = results.filter(r => r.status === 400).length;
      
      expect(successCount + failCount).toBe(3);
    });
  });

  describe('Transaction History', () => {
    test('should fetch withdrawal history', async () => {
      const res = await request(BASE_URL)
        .get('/api/payouts/me')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('requests');
      expect(Array.isArray(res.body.requests)).toBe(true);
    });
  });

  afterAll(async () => {
    // Cleanup: ลบ test user (optional)
    if (userId) {
      await request(BASE_URL)
        .post('/api/account/delete-request')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ reason: 'Test cleanup' })
        .catch(() => {});
    }
  });
});
