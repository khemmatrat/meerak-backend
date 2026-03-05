// src/routes/payment.gateway.routes.ts - Payment Gateway Routes
import { Router } from 'express';
import paymentGatewayController from '../controllers/payment.gateway.controller';
import { webhookController } from '../controllers/webhook.controller';

const router = Router();

/**
 * Payment Gateway Routes
 */

// Create payment
router.post('/create', paymentGatewayController.createPayment.bind(paymentGatewayController));

// Check payment status
router.get('/status/:payment_id', paymentGatewayController.checkPaymentStatus.bind(paymentGatewayController));

// Get payment details
router.get('/details/:payment_id', paymentGatewayController.getPaymentDetails.bind(paymentGatewayController));

// Cancel payment
router.post('/cancel/:payment_id', paymentGatewayController.cancelPayment.bind(paymentGatewayController));

// Refund payment
router.post('/refund', paymentGatewayController.refundPayment.bind(paymentGatewayController));

/**
 * Webhook Routes (no authentication required)
 */

// PromptPay/Omise webhook
router.post('/webhook/omise', webhookController.handleOmiseWebhook);

// Stripe webhook
router.post('/webhook/stripe', webhookController.handleStripeWebhook);

// TrueMoney callback
router.get('/callback', webhookController.handleTrueMoneyCallback);

export default router;
