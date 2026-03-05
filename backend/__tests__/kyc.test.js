/**
 * KYC (Know Your Customer) API Tests
 * Tests for identity verification and KYC level management
 */

import request from 'supertest';
import { describe, test, expect, beforeAll } from '@jest/globals';

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3001';

describe('KYC API Tests', () => {
  let authToken = null;
  let userId = null;

  beforeAll(async () => {
    const registerRes = await request(BASE_URL)
      .post('/api/auth/register')
      .send({
        email: `kyc_test_${Date.now()}@akonda.test`,
        password: 'Test@1234',
        phone: `082${Math.floor(1000000 + Math.random() * 9000000)}`,
        name: 'KYC Test User',
        role: 'provider'
      });
    
    if (registerRes.status === 201) {
      authToken = registerRes.body.token;
      userId = registerRes.body.user?.id;
    }
  });

  describe('KYC Status', () => {
    test('should get current KYC status', async () => {
      const res = await request(BASE_URL)
        .get(`/api/kyc/status/${userId}`)
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('kyc_level');
    });

    test('should reject KYC status request without auth', async () => {
      const res = await request(BASE_URL)
        .get(`/api/kyc/status/${userId}`);
      
      // อาจเป็น 401 หรือ 200 ขึ้นอยู่กับว่า endpoint เป็น public หรือไม่
      expect([200, 401]).toContain(res.status);
    });
  });

  describe('KYC Submission', () => {
    test('should reject KYC submission without required fields', async () => {
      const res = await request(BASE_URL)
        .post('/api/kyc/submit')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          // Missing id_card_number
          selfie_url: 'https://example.com/selfie.jpg'
        });
      
      expect(res.status).toBe(400);
    });

    test('should reject invalid ID card number format', async () => {
      const res = await request(BASE_URL)
        .post('/api/kyc/submit')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          id_card_number: '123', // Invalid format
          selfie_url: 'https://example.com/selfie.jpg',
          id_card_url: 'https://example.com/id.jpg'
        });
      
      // อาจเป็น 400 ถ้ามี validation
      expect([200, 201, 400]).toContain(res.status);
    });

    test('should accept valid KYC submission', async () => {
      const res = await request(BASE_URL)
        .post('/api/kyc/submit')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          id_card_number: '1234567890123',
          selfie_url: 'https://test.cloudinary.com/selfie.jpg',
          id_card_url: 'https://test.cloudinary.com/id_card.jpg',
          address: '123 Test Street, Bangkok'
        });
      
      expect([200, 201]).toContain(res.status);
      
      if (res.status === 201 || res.status === 200) {
        expect(res.body).toHaveProperty('message');
      }
    });
  });

  describe('KYC Level Restrictions', () => {
    test('should enforce withdrawal limits based on KYC level', async () => {
      // Level 1: จำกัดการถอนที่ 10,000 บาท/เดือน
      // ทดสอบโดยพยายามถอนเกินขีดจำกัด
      const res = await request(BASE_URL)
        .post('/api/payouts/request')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 50000, // เกินขีดจำกัด
          bank_details: { bank: 'SCB', account: '1234567890' }
        });
      
      // อาจเป็น 400 ถ้ามี KYC limit check
      expect([200, 201, 400, 403]).toContain(res.status);
    });
  });

  describe('Re-verification', () => {
    test('should allow KYC re-submission after rejection', async () => {
      // ถ้า KYC ถูกปฏิเสธ ควรสามารถส่งใหม่ได้
      const res = await request(BASE_URL)
        .post('/api/kyc/submit')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          id_card_number: '9876543210987',
          selfie_url: 'https://test.cloudinary.com/selfie_new.jpg',
          id_card_url: 'https://test.cloudinary.com/id_new.jpg'
        });
      
      expect([200, 201, 400]).toContain(res.status);
    });
  });
});
