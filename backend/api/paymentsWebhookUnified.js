/**
 * Task 21 — Unified webhook entry (facade only).
 * Each export delegates to the existing handler; semantics, idempotency, signature
 * gates, and rate limits stay in those modules / route middleware.
 *
 * Registry (this file → original implementation):
 * - POST /api/payments/webhook → dispatchPaymentsWebhookPhase1a → handlePaymentsConfirmWebhook
 * - POST /api/webhooks/stripe → dispatchStripePaymentWebhook → handleStripeWebhookRequest
 * - POST /api/webhooks/checkout → dispatchCheckoutWalletWebhook → app.get('paymentWebhookHandler')
 *
 * Not covered here (separate pipeline; still registered in server.js):
 * - POST /api/webhooks/payso
 */
import { handlePaymentsConfirmWebhook } from '../lib/paymentsWebhookConfirm.js';

/**
 * @param {import('express').Request} req
 * @param {import('pg').Pool} pool
 */
export async function dispatchPaymentsWebhookPhase1a(req, pool) {
  return handlePaymentsConfirmWebhook(req, pool);
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('pg').Pool} pool
 */
export async function dispatchStripePaymentWebhook(req, res, pool) {
  const { handleStripeWebhookRequest } = await import('../lib/stripeMatchJobPayment.js');
  return handleStripeWebhookRequest(req, res, pool);
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export function dispatchCheckoutWalletWebhook(req, res) {
  const handler = req.app.get('paymentWebhookHandler');
  if (typeof handler === 'function') return handler(req, res);
  res.status(200).send('OK');
  return undefined;
}
