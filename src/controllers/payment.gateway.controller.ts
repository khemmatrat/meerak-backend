// src/controllers/payment.gateway.controller.ts - Payment Gateway Controller
import { Request, Response } from "express";
import promptPayService from "../services/promptpay.service";
import stripeService from "../services/stripe.service";
import trueMoneyService from "../services/truemoney.service";
import {
  PaymentGateway,
  PaymentRequest,
  PaymentResponse,
} from "../types/payment.types";

export class PaymentGatewayController {
  /**
   * Create payment. Defaults to PromptPay (3-5 THB processing fee) for cost optimization.
   */
  async createPayment(req: Request, res: Response): Promise<void> {
    try {
      const paymentRequest: PaymentRequest = req.body;
      const { job_id, amount, metadata } = paymentRequest;
      const gateway = paymentRequest.gateway ?? PaymentGateway.PROMPTPAY;

      if (!amount || amount <= 0) {
        res.status(400).json({
          success: false,
          error: "Invalid amount",
        });
        return;
      }

      const billNo = await this.generateBillNo();
      const transactionNo = await this.generateTransactionNo();

      let paymentResponse: PaymentResponse;

      switch (gateway) {
        case PaymentGateway.PROMPTPAY:
          paymentResponse = await this.createPromptPayPayment(
            amount,
            job_id,
            metadata?.user_id || "",
            billNo,
            transactionNo,
            metadata,
          );
          break;

        case PaymentGateway.STRIPE:
          paymentResponse = await this.createStripePayment(
            amount,
            job_id,
            metadata?.user_id || "",
            billNo,
            transactionNo,
            metadata,
          );
          break;

        case PaymentGateway.TRUEMONEY:
          paymentResponse = await this.createTrueMoneyPayment(
            amount,
            job_id,
            metadata?.user_id || "",
            billNo,
            transactionNo,
            metadata,
          );
          break;

        default:
          res.status(400).json({
            success: false,
            error: "Invalid payment gateway",
          });
          return;
      }

      res.json(paymentResponse);
    } catch (error: any) {
      console.error("Create payment error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Payment creation failed",
      });
    }
  }

  /**
   * Create PromptPay payment
   */
  private async createPromptPayPayment(
    amount: number,
    job_id: string,
    user_id: string,
    bill_no: string,
    transaction_no: string,
    metadata?: any,
  ): Promise<PaymentResponse> {
    const payment = await promptPayService.generateQR({
      amount,
      job_id,
      user_id,
      bill_no,
      transaction_no,
      metadata,
    });

    return {
      success: true,
      payment_id: payment.payment_id,
      gateway: PaymentGateway.PROMPTPAY,
      status: payment.status,
      qr_code_url: payment.qr_code_url,
      qr_code_data: payment.qr_code_data,
      amount: payment.amount,
      currency: "THB",
      expires_at: payment.expires_at,
      bill_no: payment.ref1,
      transaction_no: payment.ref2,
      created_at: payment.created_at,
    };
  }

  /**
   * Create Stripe payment
   */
  private async createStripePayment(
    amount: number,
    job_id: string,
    user_id: string,
    bill_no: string,
    transaction_no: string,
    metadata?: any,
  ): Promise<PaymentResponse> {
    const payment = await stripeService.createPaymentIntent({
      amount,
      job_id,
      user_id,
      bill_no,
      transaction_no,
      metadata,
    });

    return {
      success: true,
      payment_id: payment.payment_intent_id,
      gateway: PaymentGateway.STRIPE,
      status: payment.status,
      client_secret: payment.client_secret,
      amount: payment.amount,
      currency: payment.currency,
      bill_no,
      transaction_no,
      created_at: payment.created_at,
    };
  }

  /**
   * Create TrueMoney payment
   */
  private async createTrueMoneyPayment(
    amount: number,
    job_id: string,
    user_id: string,
    bill_no: string,
    transaction_no: string,
    metadata?: any,
  ): Promise<PaymentResponse> {
    // Validate amount limits
    const validation = trueMoneyService.validateAmount(amount);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const payment = await trueMoneyService.createPayment({
      amount,
      order_id: job_id,
      user_id,
      callback_url: `${process.env.APP_URL}/payment/callback`,
      metadata,
    });

    return {
      success: true,
      payment_id: payment.payment_id,
      gateway: PaymentGateway.TRUEMONEY,
      status: payment.status,
      qr_code_url: payment.qr_code_url,
      deep_link: payment.deep_link,
      amount: payment.amount,
      currency: "THB",
      expires_at: payment.expires_at,
      bill_no,
      transaction_no,
      created_at: payment.created_at,
    };
  }

  /**
   * Check payment status
   */
  async checkPaymentStatus(req: Request, res: Response): Promise<void> {
    try {
      const { payment_id } = req.params;
      const { gateway } = req.query;

      if (!payment_id || !gateway) {
        res.status(400).json({
          success: false,
          error: "Missing payment_id or gateway",
        });
        return;
      }

      let status;

      switch (gateway) {
        case PaymentGateway.PROMPTPAY:
          status = await promptPayService.checkPaymentStatus(payment_id);
          break;

        case PaymentGateway.STRIPE:
          status = await stripeService.checkPaymentStatus(payment_id);
          break;

        case PaymentGateway.TRUEMONEY:
          status = await trueMoneyService.checkPaymentStatus(payment_id);
          break;

        default:
          res.status(400).json({
            success: false,
            error: "Invalid gateway",
          });
          return;
      }

      res.json({
        success: true,
        payment_id,
        gateway,
        status,
      });
    } catch (error: any) {
      console.error("Check payment status error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Status check failed",
      });
    }
  }

  /**
   * Cancel payment
   */
  async cancelPayment(req: Request, res: Response): Promise<void> {
    try {
      const { payment_id } = req.params;
      const { gateway } = req.body;

      let success = false;

      switch (gateway) {
        case PaymentGateway.PROMPTPAY:
          success = await promptPayService.cancelPayment(payment_id);
          break;

        case PaymentGateway.STRIPE:
          success = await stripeService.cancelPaymentIntent(payment_id);
          break;

        case PaymentGateway.TRUEMONEY:
          success = await trueMoneyService.cancelPayment(payment_id);
          break;

        default:
          res.status(400).json({
            success: false,
            error: "Invalid gateway",
          });
          return;
      }

      res.json({
        success,
        message: success ? "Payment cancelled" : "Cancel failed",
      });
    } catch (error: any) {
      console.error("Cancel payment error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Cancel failed",
      });
    }
  }

  /**
   * Refund payment (Stripe only for now)
   */
  async refundPayment(req: Request, res: Response): Promise<void> {
    try {
      const { payment_id, amount, reason, refunded_by } = req.body;

      // Currently only Stripe supports refunds via API
      const refundResponse = await stripeService.refundPayment({
        payment_id,
        amount,
        reason,
        refunded_by,
      });

      res.json(refundResponse);
    } catch (error: any) {
      console.error("Refund payment error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Refund failed",
      });
    }
  }

  /**
   * Get payment details
   */
  async getPaymentDetails(req: Request, res: Response): Promise<void> {
    try {
      const { payment_id } = req.params;
      const { gateway } = req.query;

      let details;

      switch (gateway) {
        case PaymentGateway.PROMPTPAY:
          details = await promptPayService.getPaymentDetails(payment_id);
          break;

        case PaymentGateway.STRIPE:
          details = await stripeService.getPaymentDetails(payment_id);
          break;

        case PaymentGateway.TRUEMONEY:
          details = await trueMoneyService.getPaymentDetails(payment_id);
          break;

        default:
          res.status(400).json({
            success: false,
            error: "Invalid gateway",
          });
          return;
      }

      res.json({
        success: true,
        data: details,
      });
    } catch (error: any) {
      console.error("Get payment details error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Get details failed",
      });
    }
  }

  /**
   * Generate bill number (Phase 0 integration)
   */
  private async generateBillNo(): Promise<string> {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const random = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, "0");
    return `BL-${date}-${random}`;
  }

  /**
   * Generate transaction number (Phase 0 integration)
   */
  private async generateTransactionNo(): Promise<string> {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const random = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, "0");
    return `TX-${date}-${random}`;
  }
}

export default new PaymentGatewayController();
