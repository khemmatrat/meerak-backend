// Thai bank QR (PromptPay) — ไม่ผูก SDK ของผู้ให้บริการรายใดใน repo
// เมื่อต้องการใช้งานจริง: ต่อ API ของ acquirer ผ่าน env ที่องค์กรกำหนด หรือใช้ gateway=stripe
import crypto from "crypto";
import { paymentProviderNotConfigured } from "../errors/paymentProviderError";
import {
  PromptPayPayment,
  PromptPayCreateRequest,
  PaymentStatus,
} from "../types/payment.types";

class PromptPayService {
  /**
   * สร้าง QR — ยังไม่ได้ต่อผู้ให้บริการชำระเงินในโค้ดนี้ (ไม่ใช้แพ็กเกจภายนอกที่ล็อกกับแบรนด์ใดแบรนด์หนึ่ง)
   */
  async generateQR(_request: PromptPayCreateRequest): Promise<PromptPayPayment> {
    throw paymentProviderNotConfigured("PromptPay / Thai QR");
  }

  async checkPaymentStatus(_paymentId: string): Promise<PaymentStatus> {
    throw paymentProviderNotConfigured("PromptPay / Thai QR");
  }

  async cancelPayment(_paymentId: string): Promise<boolean> {
    return true;
  }

  /**
   * ตรวจ HMAC ของ webhook — ใช้ PAYMENT_WEBHOOK_SECRET (ชื่อกลาง ไม่ผูกแบรนด์)
   */
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

  async getPaymentDetails(_paymentId: string): Promise<unknown> {
    throw paymentProviderNotConfigured("PromptPay / Thai QR");
  }
}

export default new PromptPayService();
