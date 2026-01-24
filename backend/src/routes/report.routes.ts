// backend/src/routes/report.routes.ts
import express from 'express';
import { reportController } from '../controllers/report.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { adminMiddleware } from '../middleware/admin.middleware';

const router = express.Router();

// Earnings reports
router.get('/earnings', authMiddleware, reportController.getEarningsReport);
router.get('/earnings/summary', authMiddleware, reportController.getEarningsSummary);

// Job reports
router.get('/jobs', authMiddleware, reportController.getJobStatistics);
router.get('/jobs/completion-rate', authMiddleware, reportController.getCompletionRate);

// Financial reports (admin only)
router.get('/financial-summary', adminMiddleware, reportController.getFinancialSummary);
router.get('/revenue', adminMiddleware, reportController.getRevenueReport);

// User activity reports
router.get('/user-activity', adminMiddleware, reportController.getUserActivity);
router.get('/user-activity/:userId', authMiddleware, reportController.getUserActivityById);

// Export reports
router.get('/export', authMiddleware, reportController.exportReport);

// Dispute reports
router.get('/disputes', authMiddleware, reportController.getDisputeReports);
router.get('/disputes/stats', adminMiddleware, reportController.getDisputeStatistics);

export default router;