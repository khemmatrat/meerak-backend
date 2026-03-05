// backend/lib/payment-gateway.js - Payment Gateway Integration (CommonJS)
const Omise = require('omise');
const Stripe = require('stripe');
const QRCode = require('qrcode');
const crypto = require('crypto');

// ============================================
// Payment Gateway Configuration
// ============================================

const isTestMode = process.env.NODE_ENV !== 'production';

// Initialize Omise (PromptPay + TrueMoney)
const omise = Omise({
  publicKey: isTestMode 
    ? process.env.OMISE_PUBLIC_KEY_TEST 
    : process.env.OMISE_PUBLIC_KEY,
  secretKey: isTestMode 
    ? process.env.OMISE_SECRET_KEY_TEST 
    : process.env.OMISE_SECRET_KEY,
});

// Parse env value — แก้ typo ใน .env เช่น STRIPE_SECRET_KEY_TEST=STRIPE_SECRET_KEY_TEST=sk_xxx
function parseEnvKey(val, keyName) {
  const s = (val || '').trim();
  const prefix = keyName + '=';
  return s.startsWith(prefix) ? s.slice(prefix.length).trim() : s;
}
const stripeSecretKey = isTestMode
  ? parseEnvKey(process.env.STRIPE_SECRET_KEY_TEST, 'STRIPE_SECRET_KEY_TEST')
  : parseEnvKey(process.env.STRIPE_SECRET_KEY, 'STRIPE_SECRET_KEY');

const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-12-18.acacia' });

// ============================================
// PromptPay Service
// ============================================

const PromptPayService = {
  /**
   * Generate PromptPay QR code
   */
  async generateQR(amount, jobId, userId, billNo, transactionNo, metadata = {}) {
    try {
      // Create Omise charge
      const charge = await omise.charges.create({
        amount: Math.round(amount * 100), // Convert to satang
        currency: 'THB',
        source: { type: 'promptpay' },
        metadata: {
          job_id: jobId,
          user_id: userId,
          bill_no: billNo,
          transaction_no: transactionNo,
          ...metadata
        },
        reference: billNo,
        description: `Payment for Job ${jobId}`,
      });

      if (!charge || !charge.source) {
        throw new Error('Failed to create PromptPay charge');
      }

      const qrCodeData = charge.source.scannable_code?.image || '';
      
      // Generate QR code image
      const qrCodeUrl = await QRCode.toDataURL(qrCodeData, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        width: 300,
        margin: 2,
      });

      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      return {
        payment_id: `pp_${charge.id}`,
        qr_code_url: qrCodeUrl,
        qr_code_data: qrCodeData,
        amount: amount,
        ref1: billNo,
        ref2: transactionNo,
        expires_at: expiresAt,
        status: this.mapStatus(charge.status),
        gateway_payment_id: charge.id,
        created_at: new Date().toISOString(),
      };
    } catch (error) {
      console.error('PromptPay QR generation failed:', error);
      throw new Error(`PromptPay error: ${error.message}`);
    }
  },

  /**
   * Check payment status
   */
  async checkStatus(paymentId) {
    try {
      const chargeId = paymentId.replace('pp_', '');
      const charge = await omise.charges.retrieve(chargeId);
      return this.mapStatus(charge.status);
    } catch (error) {
      console.error('Status check failed:', error);
      throw new Error(`Status check failed: ${error.message}`);
    }
  },

  /**
   * Map Omise status
   */
  mapStatus(omiseStatus) {
    const statusMap = {
      'pending': 'pending',
      'successful': 'completed',
      'failed': 'failed',
      'expired': 'expired',
      'reversed': 'refunded',
    };
    return statusMap[omiseStatus] || 'pending';
  },

  /**
   * Verify webhook signature
   */
  verifyWebhook(payload, signature) {
    const expectedSignature = crypto
      .createHmac('sha256', process.env.OMISE_WEBHOOK_SECRET || '')
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }
};

// ============================================
// Stripe Service
// ============================================

const StripeService = {
  /**
   * Create Payment Intent
   */
  async createPaymentIntent(amount, jobId, userId, billNo, transactionNo, metadata = {}) {
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to satang
        currency: 'thb',
        automatic_payment_methods: { enabled: true },
        metadata: {
          job_id: jobId,
          user_id: userId,
          bill_no: billNo,
          transaction_no: transactionNo,
          ...metadata
        },
        description: `Payment for Job ${jobId}`,
        receipt_email: metadata.user_email,
      });

      return {
        payment_intent_id: paymentIntent.id,
        client_secret: paymentIntent.client_secret,
        amount: amount,
        currency: 'thb',
        status: this.mapStatus(paymentIntent.status),
        created_at: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Stripe Payment Intent creation failed:', error);
      throw new Error(`Stripe error: ${error.message}`);
    }
  },

  /**
   * Check payment status
   */
  async checkStatus(paymentIntentId) {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      return this.mapStatus(paymentIntent.status);
    } catch (error) {
      console.error('Status check failed:', error);
      throw new Error(`Status check failed: ${error.message}`);
    }
  },

  /**
   * Refund payment
   */
  async refundPayment(paymentIntentId, amount = null, reason = '') {
    try {
      const refund = await stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount: amount ? Math.round(amount * 100) : undefined,
        reason: 'requested_by_customer',
        metadata: { reason: reason }
      });

      return {
        success: refund.status === 'succeeded',
        refund_id: refund.id,
        payment_id: paymentIntentId,
        amount: refund.amount / 100,
        status: refund.status === 'succeeded' ? 'completed' : 'pending',
      };
    } catch (error) {
      console.error('Refund failed:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  },

  /**
   * Map Stripe status
   */
  mapStatus(stripeStatus) {
    const statusMap = {
      'requires_payment_method': 'pending',
      'requires_confirmation': 'pending',
      'requires_action': 'pending',
      'processing': 'processing',
      'succeeded': 'completed',
      'canceled': 'cancelled',
    };
    return statusMap[stripeStatus] || 'failed';
  },

  /**
   * Verify webhook signature
   */
  verifyWebhook(payload, signature) {
    try {
      const webhookSecret = isTestMode
        ? process.env.STRIPE_WEBHOOK_SECRET_TEST
        : process.env.STRIPE_WEBHOOK_SECRET;

      const event = stripe.webhooks.constructEvent(
        payload,
        signature,
        webhookSecret
      );
      return event;
    } catch (error) {
      console.error('Webhook verification failed:', error);
      return null;
    }
  }
};

// ============================================
// TrueMoney Service
// ============================================

const TrueMoneyService = {
  /**
   * Create TrueMoney payment
   */
  async createPayment(amount, orderId, userId, callbackUrl, metadata = {}) {
    try {
      const charge = await omise.charges.create({
        amount: Math.round(amount * 100),
        currency: 'THB',
        source: { type: 'truemoney' },
        return_uri: callbackUrl,
        metadata: {
          order_id: orderId,
          user_id: userId,
          ...metadata
        },
        description: `TrueMoney payment for Order ${orderId}`,
      });

      if (!charge || !charge.source) {
        throw new Error('Failed to create TrueMoney charge');
      }

      const authorizeUri = charge.authorize_uri || '';
      const qrCodeUrl = await QRCode.toDataURL(authorizeUri, {
        errorCorrectionLevel: 'M',
        width: 300,
      });

      return {
        payment_id: `tm_${charge.id}`,
        deep_link: `truemoney://pay?id=${charge.id}&amount=${amount}`,
        qr_code_url: qrCodeUrl,
        amount: amount,
        status: PromptPayService.mapStatus(charge.status),
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
      };
    } catch (error) {
      console.error('TrueMoney payment creation failed:', error);
      throw new Error(`TrueMoney error: ${error.message}`);
    }
  },

  /**
   * Check payment status
   */
  async checkStatus(paymentId) {
    try {
      const chargeId = paymentId.replace('tm_', '');
      const charge = await omise.charges.retrieve(chargeId);
      return PromptPayService.mapStatus(charge.status);
    } catch (error) {
      console.error('Status check failed:', error);
      throw new Error(`Status check failed: ${error.message}`);
    }
  }
};

// ============================================
// Payment Gateway Utilities
// ============================================

const PaymentUtils = {
  /**
   * Generate bill number
   */
  generateBillNo() {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `BL-${date}-${random}`;
  },

  /**
   * Generate transaction number
   */
  generateTransactionNo() {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `TX-${date}-${random}`;
  },

  /**
   * Validate amount
   */
  validateAmount(amount, min = 10, max = 500000) {
    if (amount < min) {
      return { valid: false, error: `Amount must be at least ฿${min}` };
    }
    if (amount > max) {
      return { valid: false, error: `Amount cannot exceed ฿${max.toLocaleString()}` };
    }
    return { valid: true };
  }
};

// ============================================
// Express Route Handlers
// ============================================

const PaymentGatewayRoutes = {
  /**
   * POST /api/payment-gateway/create
   * Create payment with selected gateway
   */
  async createPayment(req, res) {
    try {
      const { job_id, amount, gateway, metadata = {} } = req.body;

      // Validate
      if (!amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid amount',
        });
      }

      const validation = PaymentUtils.validateAmount(amount);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: validation.error,
        });
      }

      // Generate reference numbers
      const billNo = PaymentUtils.generateBillNo();
      const transactionNo = PaymentUtils.generateTransactionNo();

      let paymentResult;

      // Route to gateway
      switch (gateway) {
        case 'promptpay':
          paymentResult = await PromptPayService.generateQR(
            amount,
            job_id,
            metadata.user_id || '',
            billNo,
            transactionNo,
            metadata
          );

          return res.json({
            success: true,
            payment_id: paymentResult.payment_id,
            gateway: 'promptpay',
            status: paymentResult.status,
            qr_code_url: paymentResult.qr_code_url,
            qr_code_data: paymentResult.qr_code_data,
            amount: paymentResult.amount,
            currency: 'THB',
            expires_at: paymentResult.expires_at,
            bill_no: billNo,
            transaction_no: transactionNo,
            created_at: paymentResult.created_at,
          });

        case 'stripe':
          paymentResult = await StripeService.createPaymentIntent(
            amount,
            job_id,
            metadata.user_id || '',
            billNo,
            transactionNo,
            metadata
          );

          return res.json({
            success: true,
            payment_id: paymentResult.payment_intent_id,
            gateway: 'stripe',
            status: paymentResult.status,
            client_secret: paymentResult.client_secret,
            amount: paymentResult.amount,
            currency: 'thb',
            bill_no: billNo,
            transaction_no: transactionNo,
            created_at: paymentResult.created_at,
          });

        case 'truemoney':
          paymentResult = await TrueMoneyService.createPayment(
            amount,
            job_id,
            metadata.user_id || '',
            `${process.env.APP_URL}/api/payment-gateway/callback`,
            metadata
          );

          return res.json({
            success: true,
            payment_id: paymentResult.payment_id,
            gateway: 'truemoney',
            status: paymentResult.status,
            qr_code_url: paymentResult.qr_code_url,
            deep_link: paymentResult.deep_link,
            amount: paymentResult.amount,
            currency: 'THB',
            expires_at: paymentResult.expires_at,
            bill_no: billNo,
            transaction_no: transactionNo,
            created_at: paymentResult.created_at,
          });

        default:
          return res.status(400).json({
            success: false,
            error: 'Invalid payment gateway',
          });
      }
    } catch (error) {
      console.error('Create payment error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Payment creation failed',
      });
    }
  },

  /**
   * GET /api/payment-gateway/status/:payment_id
   * Check payment status
   */
  async checkStatus(req, res) {
    try {
      const { payment_id } = req.params;
      const { gateway } = req.query;

      if (!payment_id || !gateway) {
        return res.status(400).json({
          success: false,
          error: 'Missing payment_id or gateway',
        });
      }

      let status;

      switch (gateway) {
        case 'promptpay':
          status = await PromptPayService.checkStatus(payment_id);
          break;
        case 'stripe':
          status = await StripeService.checkStatus(payment_id);
          break;
        case 'truemoney':
          status = await TrueMoneyService.checkStatus(payment_id);
          break;
        default:
          return res.status(400).json({
            success: false,
            error: 'Invalid gateway',
          });
      }

      res.json({
        success: true,
        payment_id,
        gateway,
        status,
      });
    } catch (error) {
      console.error('Check status error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Status check failed',
      });
    }
  },

  /**
   * POST /api/payment-gateway/refund
   * Refund payment (Stripe only)
   */
  async refundPayment(req, res) {
    try {
      const { payment_id, amount, reason } = req.body;

      const refundResult = await StripeService.refundPayment(payment_id, amount, reason);
      res.json(refundResult);
    } catch (error) {
      console.error('Refund error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Refund failed',
      });
    }
  },

  /**
   * POST /api/payment-gateway/webhook/omise
   * Handle Omise webhook (PromptPay + TrueMoney)
   */
  async handleOmiseWebhook(req, res) {
    try {
      const signature = req.headers['x-omise-signature'];
      
      if (!signature) {
        return res.status(401).json({ error: 'Missing signature' });
      }

      // Verify signature
      const payload = JSON.stringify(req.body);
      const isValid = PromptPayService.verifyWebhook(payload, signature);

      if (!isValid) {
        console.error('Invalid Omise webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      const event = req.body;
      console.log('✅ Omise webhook event:', event.key);

      // Process event
      switch (event.key) {
        case 'charge.complete':
          console.log('💰 Payment completed:', event.data.id);
          // TODO: Update database, create ledger entries
          break;
        case 'charge.failed':
          console.log('❌ Payment failed:', event.data.id);
          break;
        case 'charge.expired':
          console.log('⏰ Payment expired:', event.data.id);
          break;
        default:
          console.log('Unhandled event:', event.key);
      }

      res.json({ received: true });
    } catch (error) {
      console.error('Omise webhook error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  },

  /**
   * POST /api/payment-gateway/webhook/stripe
   * Handle Stripe webhook
   */
  async handleStripeWebhook(req, res) {
    try {
      const signature = req.headers['stripe-signature'];

      if (!signature) {
        return res.status(401).json({ error: 'Missing signature' });
      }

      const event = StripeService.verifyWebhook(req.body, signature);

      if (!event) {
        console.error('Invalid Stripe webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      console.log('✅ Stripe webhook event:', event.type);

      // Process event
      switch (event.type) {
        case 'payment_intent.succeeded':
          console.log('💰 Stripe payment succeeded:', event.data.object.id);
          // TODO: Update database, create ledger entries
          break;
        case 'payment_intent.payment_failed':
          console.log('❌ Stripe payment failed:', event.data.object.id);
          break;
        case 'charge.refunded':
          console.log('💸 Charge refunded:', event.data.object.id);
          break;
        default:
          console.log('Unhandled event:', event.type);
      }

      res.json({ received: true });
    } catch (error) {
      console.error('Stripe webhook error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  },

  /**
   * GET /api/payment-gateway/callback
   * TrueMoney callback handler
   */
  async handleCallback(req, res) {
    try {
      const { payment_id, status } = req.query;

      console.log('TrueMoney callback:', { payment_id, status });

      if (payment_id) {
        const paymentStatus = await TrueMoneyService.checkStatus(payment_id);
        
        if (paymentStatus === 'completed') {
          return res.redirect(`${process.env.FRONTEND_URL}/payment/success?payment_id=${payment_id}`);
        }
      }
      
      res.redirect(`${process.env.FRONTEND_URL}/payment/failed`);
    } catch (error) {
      console.error('Callback error:', error);
      res.redirect(`${process.env.FRONTEND_URL}/payment/failed`);
    }
  }
};

// ============================================
// Export
// ============================================

module.exports = {
  PromptPayService,
  StripeService,
  TrueMoneyService,
  PaymentUtils,
  PaymentGatewayRoutes
};
