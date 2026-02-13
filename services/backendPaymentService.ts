// services/backendPaymentService.ts
import axios from 'axios';
import { api } from './api';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

export const BackendPaymentService = {
  processPayment: async (jobId: string, method: string, discount: number = 0, has_insurance?: boolean) => {
    const response = await api.post('/payments/process', {
      jobId,
      paymentMethod: method,
      method,
      discountAmount: discount,
      discount,
      has_insurance: !!has_insurance,
      timestamp: new Date().toISOString()
    });
    return response.data;
  },

  holdPayment: async (jobId: string, amount: number) => {
    const response = await api.post('/payments/hold', {
      jobId,
      amount
    });
    return response.data.success;
  },

  releasePayment: async (jobId: string) => {
    const response = await api.post('/payments/release', {
      jobId
    });
    return response.data.success;
  },

  getPaymentStatus: async (jobId: string) => {
    const response = await api.get(`/payments/status/${jobId}`);
    return response.data;
  },

  generateReceipt: async (jobId: string) => {
    const response = await api.get(`/payments/receipt/${jobId}`);
    return response.data.receiptUrl;
  },

  refundPayment: async (jobId: string, reason: string) => {
    const response = await api.post('/payments/refund', {
      jobId,
      reason
    });
    return response.data;
  }
};