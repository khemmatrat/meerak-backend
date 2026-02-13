// src/services/promptpay.service.ts - PromptPay Payment via Omise
// Fee: ~3-5 THB per transaction (vs card gateway ~19 THB). Use PromptPay for cost reduction.
import Omise from "omise";
import QRCode from "qrcode";
import {
  PromptPayPayment,
  PromptPayCreateRequest,
  PaymentStatus,
} from "../types/payment.types";

class PromptPayService {
  private omise: any;
  private isTestMode: boolean;

  constructor() {
    this.isTestMode = process.env.NODE_ENV !== "production";

    // Initialize Omise client
    this.omise = Omise({
      publicKey: this.isTestMode
        ? process.env.OMISE_PUBLIC_KEY_TEST
        : process.env.OMISE_PUBLIC_KEY,
      secretKey: this.isTestMode
        ? process.env.OMISE_SECRET_KEY_TEST
        : process.env.OMISE_SECRET_KEY,
    });
  }

  /**
   * Generate PromptPay QR code for payment (wallet top-up or job payment).
   * job_id can be job id or topup_${userId}_${timestamp}.
   */
  async generateQR(request: PromptPayCreateRequest): Promise<PromptPayPayment> {
    try {
      const { amount, job_id, user_id, bill_no, transaction_no, metadata } =
        request;
      const isTopUp = typeof job_id === "string" && job_id.startsWith("topup_");
      const description = isTopUp
        ? `Wallet top-up ${job_id}`
        : `Payment for Job ${job_id}`;

      const charge = await this.omise.charges.create({
        amount: Math.round(amount * 100),
        currency: "THB",
        source: {
          type: "promptpay",
        },
        metadata: {
          job_id,
          user_id,
          bill_no,
          transaction_no,
          ...metadata,
        },
        reference: bill_no,
        description,
      });

      if (!charge || !charge.source) {
        throw new Error("Failed to create PromptPay charge");
      }

      // Get PromptPay QR code data
      const qrCodeData = charge.source.scannable_code?.image || "";

      // Generate QR code image as Data URL
      const qrCodeUrl = await QRCode.toDataURL(qrCodeData, {
        errorCorrectionLevel: "M",
        type: "image/png",
        width: 300,
        margin: 2,
      });

      // Calculate expiry (15 minutes from now)
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      const payment: PromptPayPayment = {
        payment_id: `pp_${charge.id}`,
        qr_code_url: qrCodeUrl,
        qr_code_data: qrCodeData,
        amount: amount,
        ref1: bill_no,
        ref2: transaction_no,
        expires_at: expiresAt,
        status: this.mapOmiseStatus(charge.status),
        gateway_payment_id: charge.id,
        created_at: new Date().toISOString(),
      };

      return payment;
    } catch (error: any) {
      console.error("PromptPay QR generation failed:", error);
      throw new Error(`PromptPay error: ${error.message}`);
    }
  }

  /**
   * Check payment status
   */
  async checkPaymentStatus(paymentId: string): Promise<PaymentStatus> {
    try {
      // Extract Omise charge ID (remove 'pp_' prefix)
      const chargeId = paymentId.replace("pp_", "");

      const charge = await this.omise.charges.retrieve(chargeId);

      return this.mapOmiseStatus(charge.status);
    } catch (error: any) {
      console.error("Failed to check payment status:", error);
      throw new Error(`Status check failed: ${error.message}`);
    }
  }

  /**
   * Cancel payment
   */
  async cancelPayment(paymentId: string): Promise<boolean> {
    try {
      const chargeId = paymentId.replace("pp_", "");

      // Omise doesn't support canceling charges, but we can mark it as expired
      // In production, you would update your database status

      return true;
    } catch (error: any) {
      console.error("Failed to cancel payment:", error);
      return false;
    }
  }

  /**
   * Map Omise status to our PaymentStatus enum
   */
  private mapOmiseStatus(omiseStatus: string): PaymentStatus {
    const statusMap: Record<string, PaymentStatus> = {
      pending: PaymentStatus.PENDING,
      successful: PaymentStatus.COMPLETED,
      failed: PaymentStatus.FAILED,
      expired: PaymentStatus.EXPIRED,
      reversed: PaymentStatus.REFUNDED,
    };

    return statusMap[omiseStatus] || PaymentStatus.PENDING;
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    const crypto = require("crypto");

    const expectedSignature = crypto
      .createHmac("sha256", process.env.OMISE_WEBHOOK_SECRET!)
      .update(payload)
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    );
  }

  /**
   * Get payment details
   */
  async getPaymentDetails(paymentId: string): Promise<any> {
    try {
      const chargeId = paymentId.replace("pp_", "");
      return await this.omise.charges.retrieve(chargeId);
    } catch (error: any) {
      console.error("Failed to get payment details:", error);
      throw new Error(`Get details failed: ${error.message}`);
    }
  }
}

export default new PromptPayService();
