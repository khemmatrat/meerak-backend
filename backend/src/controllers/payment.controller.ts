// backend/src/controllers/payment.controller.ts
import { Request, Response } from 'express';
import { PaymentService } from '../services/payment.service';
import { TransactionService } from '../services/transaction.service';

export const paymentController = {
  processPayment: async (req: Request, res: Response) => {
    try {
      const { jobId, method, discount } = req.body;
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      
      const result = await PaymentService.processPayment(userId, jobId, method, discount);
      
      return res.json({
        success: true,
        transactionId: result.transactionId,
        paymentUrl: result.paymentUrl,
        message: 'Payment initiated successfully'
      });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  holdPayment: async (req: Request, res: Response) => {
    try {
      const { jobId, amount } = req.body;
      
      const success = await PaymentService.holdPayment(jobId, amount);
      
      return res.json({ success, message: 'Payment held successfully' });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  releasePayment: async (req: Request, res: Response) => {
    try {
      const { jobId } = req.body;
      
      const success = await PaymentService.releasePayment(jobId);
      
      return res.json({ success, message: 'Payment released successfully' });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  getPaymentStatus: async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      
      const status = await PaymentService.getPaymentStatus(jobId);
      
      return res.json(status);
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  generateReceipt: async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      
      const receipt = await PaymentService.generateReceipt(jobId);
      
      return res.json({ receiptUrl: receipt });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  getPaymentHistory: async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { limit = 50, offset = 0 } = req.query;
      
      const history = await TransactionService.getUserTransactions(
        userId,
        Number(limit),
        Number(offset)
      );
      
      return res.json(history);
    } catch (error) {
      return res.status(500).json({ error: (error as Error).message });
    }
  },

  refundPayment: async (req: Request, res: Response) => {
    try {
      const { jobId, reason } = req.body;
      const result = await PaymentService.releasePayment(jobId);
      return res.json({ success: !!result, message: 'Refund initiated' });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
};