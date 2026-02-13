// backend/src/controllers/payment.controller.ts
import { Request, Response } from 'express';
import { PaymentService } from '../services/payment.service';
import { TransactionService } from '../services/transaction.service';

export const paymentController = {
  processPayment: async (req: Request, res: Response) => {
    try {
      const { jobId, method, discount } = req.body;
      const userId = req.user.id;
      
      const result = await PaymentService.processPayment(userId, jobId, method, discount);
      
      res.json({
        success: true,
        transactionId: result.transactionId,
        paymentUrl: result.paymentUrl,
        message: 'Payment initiated successfully'
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  holdPayment: async (req: Request, res: Response) => {
    try {
      const { jobId, amount } = req.body;
      
      const success = await PaymentService.holdPayment(jobId, amount);
      
      res.json({ success, message: 'Payment held successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  releasePayment: async (req: Request, res: Response) => {
    try {
      const { jobId } = req.body;
      
      const success = await PaymentService.releasePayment(jobId);
      
      res.json({ success, message: 'Payment released successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  getPaymentStatus: async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      
      const status = await PaymentService.getPaymentStatus(jobId);
      
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  generateReceipt: async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      
      const receipt = await PaymentService.generateReceipt(jobId);
      
      res.json({ receiptUrl: receipt });
    } catch (error) {
      res.status(500).json({ error: error.message });
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
      
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};