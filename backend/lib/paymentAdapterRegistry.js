/**
 * Task 20 — Provider adapter registry (deterministic resolve; delegates legacy behavior).
 * Canonical maps for: outbound HTTP backend keys, payment channel normalization,
 * local acquirer inbound MDR routing. No webhook / queue / ledger semantics.
 */

import { builtinMatrixPairs, KNOWN_BUILTIN_PROVIDERS } from './paymentMethodCapabilities.js';

/** External payment processor adapter (PAYMENT_GATEWAY_PROVIDER). */
export const PAYMENT_BACKEND_PROVIDERS = Object.freeze({
  MANUAL: 'manual',
  HTTP: 'http',
  GBPRIME: 'gbprime',
  PAYSOLUTION: 'paysolution',
});

export const PAYMENT_PROVIDERS = PAYMENT_BACKEND_PROVIDERS;

/** @type {readonly string[]} */
export const PAYMENT_BACKEND_PROVIDER_VALUES = Object.freeze(Object.values(PAYMENT_BACKEND_PROVIDERS));

/**
 * Deterministic backend selection (same semantics as legacy getPaymentGatewayProvider).
 * @param {string|null|undefined} rawEnvValue — defaults to process.env.PAYMENT_GATEWAY_PROVIDER
 */
export function resolvePaymentBackendProviderFromEnv(rawEnvValue) {
  const raw = rawEnvValue != null && rawEnvValue !== '' ? String(rawEnvValue) : process.env.PAYMENT_GATEWAY_PROVIDER;
  const p = (raw || PAYMENT_BACKEND_PROVIDERS.HTTP).toLowerCase().trim();
  if (PAYMENT_BACKEND_PROVIDER_VALUES.includes(p)) return p;
  return PAYMENT_BACKEND_PROVIDERS.HTTP;
}

/**
 * @param {string|null|undefined} raw
 * @returns {'promptpay'|'truemoney'|'shopeepay'|'stripe'|'wechat'|'alipay'|'card'}
 */
export function normalizePaymentChannel(raw) {
  const s = String(raw == null ? '' : raw)
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_');
  /** @type {Record<string, string>} */
  const map = {
    prompt_pay: 'promptpay',
    pp: 'promptpay',
    true_money: 'truemoney',
    shopee_pay: 'shopeepay',
    wechat_pay: 'wechat',
  };
  const k = map[s] || s;
  if (['promptpay', 'truemoney', 'shopeepay', 'stripe', 'wechat', 'alipay', 'card'].includes(k)) return k;
  return 'promptpay';
}

/* -------------------------------------------------------------------------- */
/* ENV rate readers (copied from legacy paymentProviderGate for parity)      */
/* -------------------------------------------------------------------------- */

function readRate(key, fallback) {
  const raw = process.env[key];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
}

function readBaht(key, fallback) {
  const raw = process.env[key];
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1_000_000 ? n : fallback;
}

/** Stripe card domestic inbound — parity with legacy stripeCardMdrDecimal. */
export function stripeCardInboundMdrDecimal() {
  const legacy = process.env.PAYMENT_MDR_STRIPE_CARD_IN;
  if (legacy != null && legacy !== '') {
    const n = Number(legacy);
    if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
  }
  return readRate('PAYMENT_MDR_STRIPE_CARD_DOMESTIC_IN', 0.0365);
}

/**
 * @param {string} ch — already normalized channel key
 */
export function resolvePaysoInboundMdrDecimal(ch) {
  switch (ch) {
    case 'promptpay':
      return readRate('PAYMENT_MDR_PAYSO_PROMPTPAY_IN', 0.01);
    case 'truemoney':
    case 'wechat':
    case 'alipay':
      return readRate('PAYMENT_MDR_PAYSO_TRUEMONEY_IN', 0.03);
    case 'shopeepay':
      return readRate('PAYMENT_MDR_PAYSO_SHOPEEPAY_IN', 0.0295);
    case 'card':
      return readRate('PAYMENT_MDR_PAYSO_CARD_IN', 0.0295);
    case 'stripe':
      return stripeCardInboundMdrDecimal();
    default:
      return readRate('PAYMENT_MDR_PAYSO_PROMPTPAY_IN', 0.01);
  }
}

/**
 * @param {string} ch — already normalized channel key
 */
export function resolveKsherInboundMdrDecimal(ch) {
  switch (ch) {
    case 'promptpay':
      return readRate('PAYMENT_MDR_KSHER_PROMPTPAY_IN', 0.005);
    case 'truemoney':
      return readRate('PAYMENT_MDR_KSHER_TRUEMONEY_IN', 0.025);
    case 'shopeepay':
      return readRate('PAYMENT_MDR_KSHER_SHOPEEPAY_IN', 0.03);
    case 'wechat':
      return readRate('PAYMENT_MDR_KSHER_WECHAT_IN', 0.02);
    case 'alipay':
      return readRate('PAYMENT_MDR_KSHER_ALIPAY_IN', 0.025);
    case 'card':
      return readRate('PAYMENT_MDR_KSHER_CARD_JURIDICAL_IN', 0.032);
    case 'stripe':
      return stripeCardInboundMdrDecimal();
    default:
      return readRate('PAYMENT_MDR_KSHER_PROMPTPAY_IN', 0.005);
  }
}

/**
 * @typedef {{ adapter_key: string, kind: 'backend_http'|'local_acquirer'|'card_rail', capabilities: {
 *   supports_promptpay_qr: boolean,
 *   supports_truemoney: boolean,
 *   supports_shopeepay: boolean,
 *   supports_wechat: boolean,
 *   supports_alipay: boolean,
 *   supports_scheme_card: boolean,
 *   supports_stripe_card_or_apm: boolean,
 * }}} PaymentAdapterProfile
 */

/** @type {Record<string, PaymentAdapterProfile>} */
const _LOCAL_PROFILE_CACHE = Object.create(null);

/** Build static capability flags from Task 15 builtin matrix (read-only). */
function buildLocalAcquirerProfiles() {
  const methodsByProvider = /** @type {Record<string, Set<string>>} */ ({});
  for (const { provider, method } of builtinMatrixPairs()) {
    const p = String(provider).toLowerCase();
    if (!methodsByProvider[p]) methodsByProvider[p] = new Set();
    methodsByProvider[p].add(String(method).toLowerCase());
  }
  for (const p of KNOWN_BUILTIN_PROVIDERS) {
    const m = methodsByProvider[p] || new Set();
    _LOCAL_PROFILE_CACHE[p] = {
      adapter_key: p,
      kind: p === 'stripe' ? 'card_rail' : 'local_acquirer',
      capabilities: {
        supports_promptpay_qr: m.has('promptpay'),
        supports_truemoney: m.has('truemoney'),
        supports_shopeepay: m.has('shopeepay'),
        supports_wechat: m.has('wechat'),
        supports_alipay: m.has('alipay'),
        supports_scheme_card: m.has('card'),
        supports_stripe_card_or_apm: p === 'stripe' && (m.has('card') || m.has('promptpay')),
      },
    };
  }
}

buildLocalAcquirerProfiles();

/**
 * @param {string} providerKeyNormalized payso | ksher | stripe
 * @returns {PaymentAdapterProfile|null}
 */
export function resolveLocalAcquirerAdapterProfile(providerKeyNormalized) {
  const k = String(providerKeyNormalized || '').toLowerCase().trim();
  const row = _LOCAL_PROFILE_CACHE[k];
  return row ? row : null;
}

/** Outbound HTTP-like processors (no local QR wallet semantics). */
export function resolveBackendAdapterProfile(backendKey) {
  const k = resolvePaymentBackendProviderFromEnv(backendKey);
  const capHttp = k === PAYMENT_BACKEND_PROVIDERS.HTTP || k === PAYMENT_BACKEND_PROVIDERS.GBPRIME || k === PAYMENT_BACKEND_PROVIDERS.PAYSOLUTION;
  return {
    adapter_key: k,
    kind: /** @type {'backend_http'} */ ('backend_http'),
    capabilities: {
      supports_promptpay_qr: capHttp,
      supports_truemoney: capHttp,
      supports_shopeepay: capHttp,
      supports_wechat: capHttp,
      supports_alipay: capHttp,
      supports_scheme_card: capHttp,
      supports_stripe_card_or_apm: k === PAYMENT_BACKEND_PROVIDERS.HTTP,
    },
  };
}

/**
 * @param {'payso'|'ksher'} gateway
 * @param {string|null|undefined} channelRaw
 */
export function resolveInboundMdrDecimalForGatewayAndChannel(gateway, channelRaw) {
  const ch = normalizePaymentChannel(channelRaw);
  if (ch === 'stripe') return stripeCardInboundMdrDecimal();
  const gw = gateway === 'ksher' ? 'ksher' : 'payso';
  return gw === 'ksher' ? resolveKsherInboundMdrDecimal(ch) : resolvePaysoInboundMdrDecimal(ch);
}
