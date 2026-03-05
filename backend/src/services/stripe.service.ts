// src/services/stripe.service.ts - Stripe Card Payment Service
import Stripe from 'stripe';
import { 
  StripePayment, 
  StripeCreateRequest, 
  PaymentStatus,
  RefundRequest,
  RefundResponse
} from '../types/payment.types';

class StripeService {
  private stripe: Stripe;
  private isTestMode: boolean;

  constructor() {
    this.isTestMode = process.env.NODE_ENV !== 'production';
    
    const apiKey = this.isTestMode 
      ? process.env.STRIPE_SECRET_KEY_TEST 
      : process.env.STRIPE_SECRET_KEY;

    if (!apiKey) {
      throw new Error('Stripe API key not configured');
    }

    this.stripe = new Stripe(apiKey, {
      apiVersion: '2024-12-18.acacia', // Use latest API version
      typescript: true,
    });
  }

  /**
   * Create Payment Intent for card payment
   */
  async createPaymentIntent(request: StripeCreateRequest): Promise<StripePayment> {
    try {
      const { amount, job_id, user_id, bill_no, transaction_no, metadata } = request;

      // Create Payment Intent
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to smallest currency unit (satang)
        currency: 'thb',
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: {
          job_id,
          user_id,
          bill_no,
          transaction_no,
          ...metadata
        },
        description: `Payment for Job ${job_id}`,
        receipt_email: metadata?.user_email,
      });

      const payment: StripePayment = {
        payment_intent_id: paymentIntent.id,
        client_secret: paymentIntent.client_secret!,
        amount: amount,
        currency: 'thb',
        status: this.mapStripeStatus(paymentIntent.status),
        created_at: new Date().toISOString(),
      };

      return payment;
    } catch (error: any) {
      console.error('Stripe Payment Intent creation failed:', error);
      throw new Error(`Stripe error: ${error.message}`);
    }
  }

  /**
   * Confirm payment (server-side)
   */
  async confirmPayment(paymentIntentId: string): Promise<PaymentStatus> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.confirm(paymentIntentId);
      return this.mapStripeStatus(paymentIntent.status);
    } catch (error: any) {
      console.error('Payment confirmation failed:', error);
      throw new Error(`Confirmation error: ${error.message}`);
    }
  }

  /**
   * Check payment status
   */
  async checkPaymentStatus(paymentIntentId: string): Promise<PaymentStatus> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
      return this.mapStripeStatus(paymentIntent.status);
    } catch (error: any) {
      console.error('Failed to check payment status:', error);
      throw new Error(`Status check failed: ${error.message}`);
    }
  }

  /**
   * Get payment details
   */
  async getPaymentDetails(paymentIntentId: string): Promise<StripePayment> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
      
      // Get card details if available
      let cardLast4: string | undefined;
      let cardBrand: string | undefined;

      if (paymentIntent.charges && paymentIntent.charges.data.length > 0) {
        const charge = paymentIntent.charges.data[0];
        if (charge.payment_method_details?.card) {
          cardLast4 = charge.payment_method_details.card.last4;
          cardBrand = charge.payment_method_details.card.brand;
        }
      }

      const payment: StripePayment = {
        payment_intent_id: paymentIntent.id,
        client_secret: paymentIntent.client_secret!,
        amount: paymentIntent.amount / 100, // Convert from satang
        currency: 'thb',
        status: this.mapStripeStatus(paymentIntent.status),
        card_last4: cardLast4,
        card_brand: cardBrand,
        receipt_url: paymentIntent.charges?.data[0]?.receipt_url || undefined,
        created_at: new Date(paymentIntent.created * 1000).toISOString(),
      };

      return payment;
    } catch (error: any) {
      console.error('Failed to get payment details:', error);
      throw new Error(`Get details failed: ${error.message}`);
    }
  }

  /**
   * Refund payment
   */
  async refundPayment(request: RefundRequest): Promise<RefundResponse> {
    try {
      const { payment_id, amount, reason, refunded_by } = request;

      // Create refund
      const refund = await this.stripe.refunds.create({
        payment_intent: payment_id,
        amount: amount ? Math.round(amount * 100) : undefined, // Partial or full refund
        reason: 'requested_by_customer',
        metadata: {
          reason: reason,
          refunded_by: refunded_by,
        }
      });

      const response: RefundResponse = {
        success: refund.status === 'succeeded',
        refund_id: refund.id,
        payment_id: payment_id,
        amount: refund.amount / 100,
        status: refund.status === 'succeeded' ? 'completed' : 'pending',
      };

      return response;
    } catch (error: any) {
      console.error('Refund failed:', error);
      return {
        success: false,
        refund_id: '',
        payment_id: request.payment_id,
        amount: request.amount || 0,
        status: 'failed',
        error: error.message,
      };
    }
  }

  /**
   * Cancel payment intent (before payment)
   */
  async cancelPaymentIntent(paymentIntentId: string): Promise<boolean> {
    try {
      await this.stripe.paymentIntents.cancel(paymentIntentId);
      return true;
    } catch (error: any) {
      console.error('Cancel payment intent failed:', error);
      return false;
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload: string | Buffer, signature: string): Stripe.Event | null {
    try {
      const webhookSecret = this.isTestMode
        ? process.env.STRIPE_WEBHOOK_SECRET_TEST
        : process.env.STRIPE_WEBHOOK_SECRET;

      if (!webhookSecret) {
        throw new Error('Webhook secret not configured');
      }

      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        webhookSecret
      );

      return event;
    } catch (error: any) {
      console.error('Webhook signature verification failed:', error);
      return null;
    }
  }

  /**
   * Map Stripe status to our PaymentStatus enum
   */
  private mapStripeStatus(stripeStatus: string): PaymentStatus {
    const statusMap: Record<string, PaymentStatus> = {
      'requires_payment_method': PaymentStatus.PENDING,
      'requires_confirmation': PaymentStatus.PENDING,
      'requires_action': PaymentStatus.PENDING,
      'processing': PaymentStatus.PROCESSING,
      'requires_capture': PaymentStatus.PROCESSING,
      'succeeded': PaymentStatus.COMPLETED,
      'canceled': PaymentStatus.CANCELLED,
    };

    return statusMap[stripeStatus] || PaymentStatus.FAILED;
  }

  /**
   * Create customer (for recurring payments or saved cards)
   */
  async createCustomer(email: string, name: string, metadata?: Record<string, any>): Promise<string> {
    try {
      const customer = await this.stripe.customers.create({
        email,
        name,
        metadata,
      });

      return customer.id;
    } catch (error: any) {
      console.error('Create customer failed:', error);
      throw new Error(`Create customer error: ${error.message}`);
    }
  }

  /**
   * Get customer payment methods
   */
  async getCustomerPaymentMethods(customerId: string): Promise<Stripe.PaymentMethod[]> {
    try {
      const paymentMethods = await this.stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
      });

      return paymentMethods.data;
    } catch (error: any) {
      console.error('Get payment methods failed:', error);
      throw new Error(`Get payment methods error: ${error.message}`);
    }
  }
}

export default new StripeService();
