// services/paymentGatewayService.ts - Fee structure from paymentFeeConfig (Thailand only)
import { api } from "./api";
import {
  WITHDRAWAL_FEE_THB,
  PAYMENT_FEE,
  MIN_WITHDRAWAL_THB,
  calculateWithdrawalFee,
} from "./paymentFeeConfig";

export { WITHDRAWAL_FEE_THB, PAYMENT_FEE };
export { MIN_WITHDRAWAL_THB, calculateWithdrawalFee };

export function getPreferredGateway(): PaymentGateway {
  return PaymentGateway.PROMPTPAY;
}

export enum PaymentGateway {
  PROMPTPAY = "promptpay",
  STRIPE = "stripe",
  TRUEMONEY = "truemoney",
}

export enum PaymentStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
  EXPIRED = "expired",
  CANCELLED = "cancelled",
  REFUNDED = "refunded",
}

export interface PaymentRequest {
  job_id: string;
  amount: number;
  gateway?: PaymentGateway;
  metadata?: {
    user_id: string;
    user_name: string;
    job_title: string;
    [key: string]: any;
  };
}

export interface PaymentResponse {
  success: boolean;
  payment_id: string;
  gateway: PaymentGateway;
  status: PaymentStatus;
  qr_code_url?: string;
  qr_code_data?: string;
  deep_link?: string;
  client_secret?: string;
  amount: number;
  currency: string;
  expires_at?: string;
  bill_no: string;
  transaction_no: string;
  error?: string;
  error_code?: string;
  created_at: string;
}

export interface PaymentStatusResponse {
  success: boolean;
  payment_id: string;
  gateway: PaymentGateway;
  status: PaymentStatus;
}

class PaymentGatewayService {
  private baseURL = "/api/payment-gateway";

  /**
   * Create payment. Defaults to PromptPay (3-5 THB) when gateway not specified.
   */
  async createPayment(request: PaymentRequest): Promise<PaymentResponse> {
    const gateway = request.gateway ?? getPreferredGateway();
    const payload = { ...request, gateway };
    try {
      const response = await api.post(`${this.baseURL}/create`, payload);
      return response.data;
    } catch (error: any) {
      console.error("Create payment error:", error);
      throw new Error(
        error.response?.data?.error || "Failed to create payment",
      );
    }
  }

  /**
   * Autotest: Generate mock PromptPay QR and payment_id (no backend).
   * Use for testing QR display and payment status verification flow.
   */
  createPromptPayPaymentTest(
    amount: number,
    refId: string,
    metadata?: { user_id?: string; job_title?: string },
  ): PaymentResponse {
    const paymentId = `pp_test_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const billNo = `BL-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;
    const txNo = `TX-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;
    const qrPayload = `00020101021230670016A00000067701011101130066${String(amount.toFixed(2)).replace(".", "")}5204999953037645802TH`;
    const qrCodeUrl = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#fff"/><text x="128" y="128" text-anchor="middle" fill="#000" font-size="12">PromptPay Test QR</text><text x="128" y="148" text-anchor="middle" fill="#666" font-size="10">฿' + amount + " - " + refId.slice(0, 12) + "</text></svg>")}`;
    return {
      success: true,
      payment_id: paymentId,
      gateway: PaymentGateway.PROMPTPAY,
      status: PaymentStatus.PENDING,
      qr_code_url: qrCodeUrl,
      qr_code_data: qrPayload,
      amount,
      currency: "THB",
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      bill_no: billNo,
      transaction_no: txNo,
      created_at: new Date().toISOString(),
    };
  }

  /**
   * Autotest: Simulate payment status (returns COMPLETED for pp_test_* after first call).
   */
  checkPaymentStatusTest(paymentId: string): PaymentStatus {
    if (paymentId.startsWith("pp_test_")) return PaymentStatus.COMPLETED;
    return PaymentStatus.PENDING;
  }

  /**
   * Create PromptPay QR payment
   */
  async createPromptPayPayment(
    jobId: string,
    amount: number,
    metadata?: Record<string, any>,
  ): Promise<PaymentResponse> {
    return this.createPayment({
      job_id: jobId,
      amount,
      gateway: PaymentGateway.PROMPTPAY,
      metadata: metadata as any,
    });
  }

  /**
   * Create Stripe card payment
   */
  async createStripePayment(
    jobId: string,
    amount: number,
    metadata?: Record<string, any>,
  ): Promise<PaymentResponse> {
    return this.createPayment({
      job_id: jobId,
      amount,
      gateway: PaymentGateway.STRIPE,
      metadata: metadata as any,
    });
  }

  /**
   * Create TrueMoney wallet payment
   */
  async createTrueMoneyPayment(
    jobId: string,
    amount: number,
    metadata?: Record<string, any>,
  ): Promise<PaymentResponse> {
    return this.createPayment({
      job_id: jobId,
      amount,
      gateway: PaymentGateway.TRUEMONEY,
      metadata: metadata as any,
    });
  }

  /**
   * Check payment status
   */
  async checkPaymentStatus(
    paymentId: string,
    gateway: PaymentGateway,
  ): Promise<PaymentStatusResponse> {
    try {
      const response = await api.get(`${this.baseURL}/status/${paymentId}`, {
        params: { gateway },
      });
      return response.data;
    } catch (error: any) {
      console.error("Check payment status error:", error);
      throw new Error(
        error.response?.data?.error || "Failed to check payment status",
      );
    }
  }

  /**
   * Poll payment status until completed/failed (for QR payments)
   */
  async pollPaymentStatus(
    paymentId: string,
    gateway: PaymentGateway,
    maxAttempts: number = 60, // 5 minutes (5s interval)
    interval: number = 5000, // 5 seconds
  ): Promise<PaymentStatus> {
    let attempts = 0;

    return new Promise((resolve, reject) => {
      const poll = setInterval(async () => {
        attempts++;

        try {
          const result = await this.checkPaymentStatus(paymentId, gateway);

          // If completed or failed, stop polling
          if (
            result.status === PaymentStatus.COMPLETED ||
            result.status === PaymentStatus.FAILED ||
            result.status === PaymentStatus.EXPIRED ||
            result.status === PaymentStatus.CANCELLED
          ) {
            clearInterval(poll);
            resolve(result.status);
          }

          // If max attempts reached, stop polling
          if (attempts >= maxAttempts) {
            clearInterval(poll);
            reject(new Error("Payment status check timeout"));
          }
        } catch (error) {
          clearInterval(poll);
          reject(error);
        }
      }, interval);
    });
  }

  /**
   * Get payment details
   */
  async getPaymentDetails(
    paymentId: string,
    gateway: PaymentGateway,
  ): Promise<any> {
    try {
      const response = await api.get(`${this.baseURL}/details/${paymentId}`, {
        params: { gateway },
      });
      return response.data;
    } catch (error: any) {
      console.error("Get payment details error:", error);
      throw new Error(
        error.response?.data?.error || "Failed to get payment details",
      );
    }
  }

  /**
   * Cancel payment
   */
  async cancelPayment(
    paymentId: string,
    gateway: PaymentGateway,
  ): Promise<boolean> {
    try {
      const response = await api.post(`${this.baseURL}/cancel/${paymentId}`, {
        gateway,
      });
      return response.data.success;
    } catch (error: any) {
      console.error("Cancel payment error:", error);
      throw new Error(
        error.response?.data?.error || "Failed to cancel payment",
      );
    }
  }

  /**
   * Request refund (admin only)
   */
  async refundPayment(
    paymentId: string,
    amount?: number,
    reason?: string,
  ): Promise<any> {
    try {
      const response = await api.post(`${this.baseURL}/refund`, {
        payment_id: paymentId,
        amount,
        reason,
      });
      return response.data;
    } catch (error: any) {
      console.error("Refund payment error:", error);
      throw new Error(
        error.response?.data?.error || "Failed to refund payment",
      );
    }
  }

  /**
   * Open TrueMoney deep link (mobile only)
   */
  openTrueMoneyDeepLink(deepLink: string): void {
    if (this.isMobile()) {
      window.location.href = deepLink;
    } else {
      console.warn("Deep link only works on mobile devices");
    }
  }

  /**
   * Check if running on mobile
   */
  private isMobile(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    );
  }

  /**
   * Download QR code image
   */
  downloadQRCode(qrCodeUrl: string, filename: string = "payment-qr.png"): void {
    const link = document.createElement("a");
    link.href = qrCodeUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Format amount to THB currency
   */
  formatAmount(amount: number): string {
    return new Intl.NumberFormat("th-TH", {
      style: "currency",
      currency: "THB",
    }).format(amount);
  }

  /**
   * Get payment gateway display name
   */
  getGatewayName(gateway: PaymentGateway): string {
    const names: Record<PaymentGateway, string> = {
      [PaymentGateway.PROMPTPAY]: "PromptPay",
      [PaymentGateway.STRIPE]: "บัตรเครดิต/เดบิต",
      [PaymentGateway.TRUEMONEY]: "TrueMoney Wallet",
    };
    return names[gateway];
  }

  /**
   * Get payment status display text
   */
  getStatusText(status: PaymentStatus): string {
    const texts: Record<PaymentStatus, string> = {
      [PaymentStatus.PENDING]: "รอชำระเงิน",
      [PaymentStatus.PROCESSING]: "กำลังดำเนินการ",
      [PaymentStatus.COMPLETED]: "ชำระเงินสำเร็จ",
      [PaymentStatus.FAILED]: "ชำระเงินล้มเหลว",
      [PaymentStatus.EXPIRED]: "หมดอายุ",
      [PaymentStatus.CANCELLED]: "ยกเลิก",
      [PaymentStatus.REFUNDED]: "คืนเงินแล้ว",
    };
    return texts[status];
  }

  /**
   * Get payment status color
   */
  getStatusColor(status: PaymentStatus): string {
    const colors: Record<PaymentStatus, string> = {
      [PaymentStatus.PENDING]: "text-yellow-600",
      [PaymentStatus.PROCESSING]: "text-blue-600",
      [PaymentStatus.COMPLETED]: "text-green-600",
      [PaymentStatus.FAILED]: "text-red-600",
      [PaymentStatus.EXPIRED]: "text-gray-600",
      [PaymentStatus.CANCELLED]: "text-gray-600",
      [PaymentStatus.REFUNDED]: "text-purple-600",
    };
    return colors[status];
  }
}

export default new PaymentGatewayService();
