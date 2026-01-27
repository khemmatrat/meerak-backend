// backend/src/routes/kyc.routes.ts
import express from 'express';
import multer from 'multer';
import { kycController } from '../controllers/kyc.controller';
import { authMiddleware } from '../middleware/auth';

const upload = multer({ dest: 'uploads/kyc/' });
const router = express.Router();

// KYC document upload
router.post('/upload', authMiddleware, upload.array('documents', 5), kycController.uploadDocuments);

// KYC verification
router.post('/verify', authMiddleware, kycController.verifyIdentity);
router.post('/verify/ai', authMiddleware, kycController.verifyWithAI);

// KYC status
router.get('/status/:userId', authMiddleware, kycController.getKYCStatus);
router.get('/status', authMiddleware, kycController.getUserKYCStatus);

// Admin KYC management
router.get('/pending', authMiddleware, kycController.getPendingKYC);
router.put('/approve/:kycId', authMiddleware, kycController.approveKYC);
router.put('/reject/:kycId', authMiddleware, kycController.rejectKYC);

export default router;