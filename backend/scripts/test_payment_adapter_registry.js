/**
 * Task 20 — paymentAdapterRegistry unit checks + parity smoke.
 *
 *   cd backend && node scripts/test_payment_adapter_registry.js
 *   cd backend && node scripts/test_payment_method_capabilities.js
 *   cd backend && node scripts/test_phase1a_regressions.js
 */

import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import {
  PAYMENT_BACKEND_PROVIDERS,
  PAYMENT_PROVIDERS,
  normalizePaymentChannel,
  resolvePaymentBackendProviderFromEnv,
  resolveLocalAcquirerAdapterProfile,
  resolveInboundMdrDecimalForGatewayAndChannel,
  resolvePaysoInboundMdrDecimal,
  resolveKsherInboundMdrDecimal,
  stripeCardInboundMdrDecimal,
} from '../lib/paymentAdapterRegistry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendDir = join(__dirname, '..');
dotenv.config({ path: join(backendDir, '.env') });

function ok(label, cond, detail = '') {
  if (!cond) {
    console.error(`FAIL: ${label}`, detail || '');
    process.exit(1);
  }
  console.log(`OK: ${label}`);
}

console.log('=== Task 20 adapter registry ===');

ok('PAYMENT_PROVIDERS aliases backend keys', PAYMENT_PROVIDERS.HTTP === PAYMENT_BACKEND_PROVIDERS.HTTP);

ok('normalize synonyms', normalizePaymentChannel('prompt_pay') === 'promptpay');
ok('normalize default unknown', normalizePaymentChannel('weird') === 'promptpay');

const saved = process.env.PAYMENT_GATEWAY_PROVIDER;
process.env.PAYMENT_GATEWAY_PROVIDER = 'gbprime';
ok('resolve backend gbprime', resolvePaymentBackendProviderFromEnv() === 'gbprime');
process.env.PAYMENT_GATEWAY_PROVIDER = 'nope';
ok('resolve backend fallback http', resolvePaymentBackendProviderFromEnv() === PAYMENT_BACKEND_PROVIDERS.HTTP);
process.env.PAYMENT_GATEWAY_PROVIDER = saved;

const stripeCh = resolveInboundMdrDecimalForGatewayAndChannel('payso', 'stripe');
ok('stripe channel inbound parity payso', stripeCh === stripeCardInboundMdrDecimal());

const ppPayso = resolvePaysoInboundMdrDecimal('promptpay');
const ppKsher = resolveKsherInboundMdrDecimal('promptpay');
ok('promptpay inbound numeric', Number.isFinite(ppPayso) && Number.isFinite(ppKsher));

const px = resolveLocalAcquirerAdapterProfile('payso');
ok('payso profile', px?.adapter_key === 'payso' && px.capabilities.supports_promptpay_qr === true);
const sx = resolveLocalAcquirerAdapterProfile('stripe');
ok('stripe profile', sx?.adapter_key === 'stripe' && sx.capabilities.supports_promptpay_qr === true);

console.log('\nPASS: test_payment_adapter_registry.js\n');
