// Thai mobile wallet (เช่น TrueMoney) — ไม่ผูก SDK ของผู้ให้บริการรายใดใน repo
import crypto from "crypto";
import { paymentProviderNotConfigured } from "../errors/paymentProviderError";
import {
  TrueMoneyPayment,
  TrueMoneyCreateRequest,
  PaymentStatus,
} from "../types/payment.types";

class TrueMoneyService {
  async createPayment(_request: TrueMoneyCreateRequest): Promise<TrueMoneyPayment> {
    throw paymentProviderNotConfigured("e-wallet / Thai wallet");
  }

  async checkPaymentStatus(_paymentId: string): Promise<PaymentStatus> {
    throw paymentProviderNotConfigured("e-wallet / Thai wallet");
  }

  async getPaymentDetails(_paymentId: string): Promise<TrueMoneyPayment> {
    throw paymentProviderNotConfigured("e-wallet / Thai wallet");
  }

  async cancelPayment(_paymentId: string): Promise<boolean> {
    return true;
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    const secret = process.env.PAYMENT_WEBHOOK_SECRET;
    if (!secret || !signature) return false;
    try {
      const expected = crypto
        .createHmac("sha256", secret)
        .update(payload)
        .digest("hex");
      const a = Buffer.from(signature, "utf8");
      const b = Buffer.from(expected, "utf8");
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  async isAvailable(): Promise<boolean> {
    return false;
  }

  getPaymentLimits(): { min: number; max: number } {
    return { min: 20, max: 300000 };
  }

  validateAmount(amount: number): { valid: boolean; error?: string } {
    const limits = this.getPaymentLimits();
    if (amount < limits.min) {
      return { valid: false, error: `Amount must be at least ฿${limits.min}` };
    }
    if (amount > limits.max) {
      return {
        valid: false,
        error: `Amount cannot exceed ฿${limits.max.toLocaleString()}`,
      };
    }
    return { valid: true };
  }
}

export default new TrueMoneyService();
