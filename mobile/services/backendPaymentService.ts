// services/backendPaymentService.ts
import axios from 'axios';
import { api } from './api';
import { readStoredPaymentChannel } from '../config/paymentChannelStorage';
import type { UxPaymentCanonical } from './uxPaymentResponse';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

/** Error from POST /payments/process — axios ไม่ใส่ response.data ใน message โดยอัตโนมัติ */
export type PaymentProcessError = Error & {
  code?: string;
  required_delta?: number;
  balance?: number;
};

/** When POST /payments/* or POST /payment-gateway/create returns PAYMENT_CREATE_RATE_LIMITED */
export type PaymentRateLimitedPayload = {
  failure_code?: string;
  retry_after_seconds?: number;
  retry_after?: number;
};

/**
 * Parses 429 PAYMENT_CREATE_RATE_LIMITED from axios-like errors without logging secrets/payload bodies.
 */
export function parsePaymentRateLimitError(error: unknown): { retryAfterSec: number } | null {
  const ax = error as {
    response?: { status?: number; data?: PaymentRateLimitedPayload };
  };
  if (ax?.response?.status !== 429) return null;
  const data = ax.response.data;
  if (data?.failure_code !== "PAYMENT_CREATE_RATE_LIMITED") return null;
  const sec = Number(data.retry_after_seconds ?? data.retry_after ?? 60) || 60;
  return { retryAfterSec: Math.max(1, sec) };
}

export const BackendPaymentService = {
  processPayment: async (jobId: string, method: string, discount: number = 0, has_insurance?: boolean) => {
    const ch = readStoredPaymentChannel();
    try {
      const response = await api.post('/payments/process', {
        jobId,
        paymentMethod: method,
        method,
        discountAmount: discount,
        discount,
        has_insurance: !!has_insurance,
        ...(ch ? { payment_channel: ch, paymentChannel: ch } : {}),
        timestamp: new Date().toISOString()
      });
      return response.data;
    } catch (e: unknown) {
      const ax = e as { response?: { data?: Record<string, unknown> }; message?: string };
      const data = ax?.response?.data;
      const msg =
        (typeof data?.message === 'string' && data.message) ||
        (typeof data?.error === 'string' && data.error) ||
        ax?.message ||
        'Payment failed';
      const err = new Error(msg) as PaymentProcessError;
      if (typeof data?.code === 'string') err.code = data.code;
      if (data?.required_delta != null) err.required_delta = Number(data.required_delta);
      if (data?.balance != null) err.balance = Number(data.balance);
      throw err;
    }
  },

  holdPayment: async (jobId: string, _amount?: number, has_insurance?: boolean) => {
    const response = await api.post('/payments/hold', { jobId, has_insurance: !!has_insurance });
    return response.data?.success === true;
  },

  saveInsurancePreference: async (jobId: string, wants_insurance: boolean) => {
    const userId = localStorage.getItem('meerak_user_id') || localStorage.getItem('authUserId');
    const response = await api.patch(`/jobs/${jobId}/insurance-preference`, { wants_insurance, userId });
    return response.data?.success === true;
  },

  releasePayment: async (jobId: string) => {
    const response = await api.post('/payments/release', {
      jobId
    });
    return response.data.success;
  },

  /** หลังอนุมัติ: รอจนกว่า provider_release_after จะผ่าน (กันเงิน 5 นาที) แล้วค่อยปล่อย */
  pollReleasePayment: async (jobId: string, maxWaitMs = 12 * 60 * 1000) => {
    const deadline = Date.now() + maxWaitMs;
    let lastErr: unknown;
    while (Date.now() < deadline) {
      try {
        const response = await api.post('/payments/release', { jobId });
        return response.data?.success === true;
      } catch (e: any) {
        lastErr = e;
        const data = e?.response?.data;
        if (e?.response?.status === 400 && data?.error === 'release_too_early') {
          const sec = Math.min(Math.max(Number(data.retryAfterSeconds) || 5, 1), 120);
          await new Promise((r) => setTimeout(r, sec * 1000));
          continue;
        }
        throw e;
      }
    }
    console.warn('pollReleasePayment: timeout', jobId, lastErr);
    return false;
  },

  getPaymentStatus: async (jobId: string) => {
    const response = await api.get(`/payments/status/${jobId}`);
    return response.data as {
      paid?: boolean;
      paidAt?: string;
      amount?: number;
      status?: string;
      providerReceive?: number;
      releasedStatus?: string;
      ux?: UxPaymentCanonical;
    };
  },

  generateReceipt: async (jobId: string) => {
    const response = await api.get(`/payments/receipt/${jobId}`);
    return response.data.receiptUrl;
  },

  getPaymentBreakdown: async (jobId: string, discountAmount: number = 0, has_insurance?: boolean) => {
    const response = await api.get(`/payments/breakdown/${jobId}`, {
      params: { discountAmount, has_insurance: has_insurance === true }
    });
    return response.data;
  },

  /** POST /api/payments/create-intent — Stripe PaymentIntent (clientSecret + publishableKey) */
  createStripePaymentIntent: async (params: {
    jobId: string;
    discountAmount?: number;
    has_insurance?: boolean;
    maturityVoucherId?: string | null;
  }) => {
    const response = await api.post('/payments/create-intent', {
      jobId: params.jobId,
      discountAmount: params.discountAmount ?? 0,
      has_insurance: params.has_insurance === true,
      maturityVoucherId: params.maturityVoucherId ?? undefined,
    });
    return response.data as {
      clientSecret: string;
      paymentIntentId: string;
      amountThb: number;
      amountSatang: number;
      publishableKey: string;
      ux?: UxPaymentCanonical;
    };
  },

  refundPayment: async (jobId: string, reason: string) => {
    const response = await api.post('/payments/refund', {
      jobId,
      reason
    });
    return response.data;
  }
};