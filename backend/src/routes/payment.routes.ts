// backend/src/routes/payment.routes.ts
import express from 'express';
import { paymentController } from '../controllers/payment.controller';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

// Payment processing
router.post('/process', authMiddleware, paymentController.processPayment);
router.post('/hold', authMiddleware, paymentController.holdPayment);
router.post('/release', authMiddleware, paymentController.releasePayment);
router.post('/refund', authMiddleware, paymentController.refundPayment);
// routes/payment.routes.ts
router.post('/secure-pay', authMiddleware, paymentController.securePay);


// Payment queries
router.get('/status/:jobId', authMiddleware, paymentController.getPaymentStatus);
router.get('/receipt/:jobId', authMiddleware, paymentController.generateReceipt);
router.get('/history/:userId', authMiddleware, paymentController.getPaymentHistory);


export default router;