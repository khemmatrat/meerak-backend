/**
 * Payment gateway facade — switch provider via PAYMENT_GATEWAY_PROVIDER:
 *   manual | http | gbprime | paysolution (future: wire adapters here)
 */
import { PaymentHttpClient } from './paymentHttpClient.js';
import {
  PAYMENT_BACKEND_PROVIDERS as PAYMENT_PROVIDERS_ALIAS,
  resolvePaymentBackendProviderFromEnv,
} from './paymentAdapterRegistry.js';

/** Registry-backed (Task 20). */
export const PAYMENT_PROVIDERS = PAYMENT_PROVIDERS_ALIAS;

export function getPaymentGatewayProvider() {
  return resolvePaymentBackendProviderFromEnv();
}

export function getPaymentGatewaySecretKey() {
  const prod = process.env.PAYMENT_GATEWAY_SECRET_KEY;
  const test = process.env.NODE_ENV !== 'production' ? process.env.PAYMENT_GATEWAY_SECRET_KEY_TEST : null;
  return String(prod || test || '').trim().replace(/^["']|["']$/g, '');
}

export function getPaymentGatewayWebhookSecret() {
  const prod = process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET;
  const test = process.env.NODE_ENV !== 'production' ? process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET_TEST : null;
  return String(prod || test || '').trim();
}

/** Creates HTTP client for providers that use REST + Basic auth (configure host in env). */
export function createPaymentHttpClient() {
  const key = getPaymentGatewaySecretKey();
  if (!key) throw new Error('PAYMENT_GATEWAY_SECRET_KEY not configured');
  return new PaymentHttpClient(key);
}

export function isAutoPayoutGatewayTransferEnabled() {
  return (
    process.env.AUTO_PAYOUT_GATEWAY_TRANSFER_ENABLED === '1' ||
    process.env.AUTO_PAYOUT_PAYSO_ENABLED === '1' ||
    process.env.AUTO_PAYOUT_OMISE_ENABLED === '1'
  );
}
