// backend/src/routes/integration.routes.ts
// Routes สำหรับ integration กับ Firebase Functions

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getFirebaseFunctionsClient } from '../integrations/firebase-functions.client';
import { getSharedDatabaseService } from '../services/shared-db.service';

const router = Router();
const functionsClient = getFirebaseFunctionsClient();
const sharedDb = getSharedDatabaseService();

/**
 * POST /api/integration/kyc/submit
 * Submit KYC ผ่าน Firebase Functions
 */
router.post('/kyc/submit', authenticate, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const idToken = req.headers.authorization?.replace('Bearer ', '');
    if (!idToken) {
      return res.status(401).json({ error: 'Missing authorization token' });
    }

    const kycData = req.body;
    const result = await functionsClient.submitKYC(idToken, kycData);

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('KYC submission error:', error);
    res.status(500).json({
      error: 'Failed to submit KYC',
      message: error.message,
    });
  }
});

/**
 * GET /api/integration/kyc/status
 * Check KYC status จาก Firebase Functions
 */
router.get('/kyc/status', authenticate, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const idToken = req.headers.authorization?.replace('Bearer ', '');
    if (!idToken) {
      return res.status(401).json({ error: 'Missing authorization token' });
    }

    const status = await functionsClient.checkKYCStatus(idToken);

    // Sync KYC status ไปยัง users table
    if (status.postgresql) {
      await sharedDb.syncKYCStatusFromSubmissions(req.user.firebase_uid);
    }

    res.json(status);
  } catch (error: any) {
    console.error('KYC status check error:', error);
    res.status(500).json({
      error: 'Failed to check KYC status',
      message: error.message,
    });
  }
});

/**
 * POST /api/integration/kyc/verify-ai
 * Verify KYC with AI ผ่าน Firebase Functions
 */
router.post('/kyc/verify-ai', authenticate, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const idToken = req.headers.authorization?.replace('Bearer ', '');
    if (!idToken) {
      return res.status(401).json({ error: 'Missing authorization token' });
    }

    const result = await functionsClient.verifyKYCWithAI(idToken);

    // Sync KYC status หลังจาก verify
    await sharedDb.syncKYCStatusFromSubmissions(req.user.firebase_uid);

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('AI verification error:', error);
    res.status(500).json({
      error: 'Failed to verify KYC with AI',
      message: error.message,
    });
  }
});

/**
 * GET /api/integration/postgres/health
 * Check PostgreSQL health จาก Firebase Functions
 */
router.get('/postgres/health', authenticate, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const idToken = req.headers.authorization?.replace('Bearer ', '');
    if (!idToken) {
      return res.status(401).json({ error: 'Missing authorization token' });
    }

    const health = await functionsClient.getPostgresHealth(idToken);
    res.json(health);
  } catch (error: any) {
    console.error('PostgreSQL health check error:', error);
    res.status(500).json({
      error: 'Failed to check PostgreSQL health',
      message: error.message,
    });
  }
});

/**
 * POST /api/integration/sync-user
 * Sync user data จาก Firebase Functions ไป PostgreSQL
 */
router.post('/sync-user', authenticate, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const idToken = req.headers.authorization?.replace('Bearer ', '');
    if (!idToken) {
      return res.status(401).json({ error: 'Missing authorization token' });
    }

    const result = await functionsClient.syncUserToPostgres(idToken);

    // Sync wallet balance
    await sharedDb.syncWalletBalance(req.user.firebase_uid);

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('Sync user error:', error);
    res.status(500).json({
      error: 'Failed to sync user',
      message: error.message,
    });
  }
});

export default router;
