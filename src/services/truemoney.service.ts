// src/services/truemoney.service.ts - TrueMoney Wallet Payment Service
import Omise from 'omise';
import QRCode from 'qrcode';
import { 
  TrueMoneyPayment, 
  TrueMoneyCreateRequest, 
  PaymentStatus 
} from '../types/payment.types';

class TrueMoneyService {
  private omise: any;
  private isTestMode: boolean;

  constructor() {
    this.isTestMode = process.env.NODE_ENV !== 'production';
    
    // TrueMoney payment is also handled through Omise
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
   * Create TrueMoney Wallet payment
   */
  async createPayment(request: TrueMoneyCreateRequest): Promise<TrueMoneyPayment> {
    try {
      const { amount, order_id, user_id, callback_url, metadata } = request;

      // Create Omise charge with TrueMoney source
      const charge = await this.omise.charges.create({
        amount: Math.round(amount * 100), // Convert to satang
        currency: 'THB',
        source: {
          type: 'truemoney',
        },
        return_uri: callback_url,
        metadata: {
          order_id,
          user_id,
          ...metadata
        },
        description: `TrueMoney payment for Order ${order_id}`,
      });

      if (!charge || !charge.source) {
        throw new Error('Failed to create TrueMoney charge');
      }

      // Get TrueMoney payment data
      const authorizeUri = charge.authorize_uri || '';
      const deepLink = this.generateDeepLink(charge.id, amount);
      
      // Generate QR code for web users
      const qrCodeUrl = await QRCode.toDataURL(authorizeUri, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        width: 300,
        margin: 2,
      });

      // Calculate expiry (15 minutes from now)
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      const payment: TrueMoneyPayment = {
        payment_id: `tm_${charge.id}`,
        deep_link: deepLink,
        qr_code_url: qrCodeUrl,
        amount: amount,
        status: this.mapOmiseStatus(charge.status),
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
      };

      return payment;
    } catch (error: any) {
      console.error('TrueMoney payment creation failed:', error);
      throw new Error(`TrueMoney error: ${error.message}`);
    }
  }

  /**
   * Generate TrueMoney deep link for mobile app
   */
  private generateDeepLink(chargeId: string, amount: number): string {
    // TrueMoney deep link format
    // This is a simplified version - actual implementation depends on TrueMoney's spec
    const baseUrl = 'truemoney://pay';
    const params = new URLSearchParams({
      id: chargeId,
      amount: amount.toString(),
    });
    
    return `${baseUrl}?${params.toString()}`;
  }

  /**
   * Check payment status
   */
  async checkPaymentStatus(paymentId: string): Promise<PaymentStatus> {
    try {
      // Extract Omise charge ID (remove 'tm_' prefix)
      const chargeId = paymentId.replace('tm_', '');
      
      const charge = await this.omise.charges.retrieve(chargeId);
      
      return this.mapOmiseStatus(charge.status);
    } catch (error: any) {
      console.error('Failed to check payment status:', error);
      throw new Error(`Status check failed: ${error.message}`);
    }
  }

  /**
   * Get payment details
   */
  async getPaymentDetails(paymentId: string): Promise<TrueMoneyPayment> {
    try {
      const chargeId = paymentId.replace('tm_', '');
      const charge = await this.omise.charges.retrieve(chargeId);

      const authorizeUri = charge.authorize_uri || '';
      const qrCodeUrl = await QRCode.toDataURL(authorizeUri, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        width: 300,
      });

      const payment: TrueMoneyPayment = {
        payment_id: paymentId,
        deep_link: this.generateDeepLink(charge.id, charge.amount / 100),
        qr_code_url: qrCodeUrl,
        amount: charge.amount / 100,
        status: this.mapOmiseStatus(charge.status),
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        created_at: new Date(charge.created * 1000).toISOString(),
      };

      return payment;
    } catch (error: any) {
      console.error('Failed to get payment details:', error);
      throw new Error(`Get details failed: ${error.message}`);
    }
  }

  /**
   * Cancel payment
   */
  async cancelPayment(paymentId: string): Promise<boolean> {
    try {
      const chargeId = paymentId.replace('tm_', '');
      
      // Note: Omise doesn't support direct cancellation of TrueMoney charges
      // The charge will expire automatically after the timeout period
      // You should update your database status to 'cancelled'
      
      return true;
    } catch (error: any) {
      console.error('Failed to cancel payment:', error);
      return false;
    }
  }

  /**
   * Map Omise status to our PaymentStatus enum
   */
  private mapOmiseStatus(omiseStatus: string): PaymentStatus {
    const statusMap: Record<string, PaymentStatus> = {
      'pending': PaymentStatus.PENDING,
      'successful': PaymentStatus.COMPLETED,
      'failed': PaymentStatus.FAILED,
      'expired': PaymentStatus.EXPIRED,
      'reversed': PaymentStatus.REFUNDED,
    };

    return statusMap[omiseStatus] || PaymentStatus.PENDING;
  }

  /**
   * Verify webhook signature (same as PromptPay, using Omise)
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    const crypto = require('crypto');
    
    const expectedSignature = crypto
      .createHmac('sha256', process.env.OMISE_WEBHOOK_SECRET!)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Process webhook event
   */
  async processWebhookEvent(event: any): Promise<void> {
    try {
      const { object, data } = event;

      if (object === 'event' && data) {
        const charge = data;
        
        switch (event.key) {
          case 'charge.complete':
            console.log('TrueMoney payment completed:', charge.id);
            // Update your database with completed status
            break;
            
          case 'charge.failed':
            console.log('TrueMoney payment failed:', charge.id);
            // Update your database with failed status
            break;
            
          case 'charge.expired':
            console.log('TrueMoney payment expired:', charge.id);
            // Update your database with expired status
            break;
            
          default:
            console.log('Unhandled TrueMoney webhook event:', event.key);
        }
      }
    } catch (error: any) {
      console.error('Failed to process webhook event:', error);
      throw error;
    }
  }

  /**
   * Check if TrueMoney is available (for testing)
   */
  async isAvailable(): Promise<boolean> {
    try {
      // In production, you might want to check TrueMoney service status
      // For now, we'll just check if Omise is configured
      return !!process.env.OMISE_SECRET_KEY;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get supported payment limits
   */
  getPaymentLimits(): { min: number; max: number } {
    return {
      min: 20,      // ฿20 minimum
      max: 300000,  // ฿300,000 maximum per transaction
    };
  }

  /**
   * Validate payment amount
   */
  validateAmount(amount: number): { valid: boolean; error?: string } {
    const limits = this.getPaymentLimits();
    
    if (amount < limits.min) {
      return {
        valid: false,
        error: `Amount must be at least ฿${limits.min}`,
      };
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
