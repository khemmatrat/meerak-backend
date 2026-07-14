/**
 * Payso (Pay Solutions) None-UI PromptPay payout integration.
 * Reference: https://api-docs.payso.co/docs/api/none-ui-api/promptpay-api
 *
 * Configure via environment (merchant dashboard / Payso support):
 *   PAYSO_ENABLED=1
 *   PAYSO_API_BASE_URL=https://...        (no trailing slash)
 *   PAYSO_MERCHANT_ID=                    (merchant id from Payso)
 *   PAYSO_API_KEY= or PAYSO_SECRET_KEY=   (API credential)
 *   PAYSO_AUTH_MODE=bearer | basic | header   (default bearer)
 *   PAYSO_API_KEY_HEADER=X-API-Key        (when AUTH_MODE=header)
 *   PAYSO_PROMPTPAY_PAYOUT_PATH=/...      (REST path; adjust per Payso merchant API)
 *   PAYSO_DEPOSIT_PATH=/...               (wallet top-up / QR receive — default /api/v2/promptpaynew)
 *   PAYSO_MOBILE_BANKING_DEPOSIT_PATH=    (Mobile/Internet Banking None-UI — from Pay Solutions doc; empty = skip PaySo MB)
 *   PAYSO_MOBILE_BANKING_BANK_QUERY_KEY=bankCode   (QS key for bank identifier sent upstream)
 *   PAYSO_MOBILE_BANKING_ACCOUNT_QUERY_KEY=bankAccountNo
 *   PAYSO_MOBILE_BANKING_BANK_MAP_JSON=   (optional JSON {"scb":"SCB"} overrides defaults)
 *   PAYSO_AMOUNT_UNIT=thb                 (thb | satang — default thb)
 *   PAYSO_WEBHOOK_SECRET=                 (HMAC key for webhook verification)
 *   PAYSO_WEBHOOK_SIGNATURE_HEADER=x-payso-signature
 */


import crypto from 'crypto';
import https from 'https';
import { calcDepositFeeBreakdown } from '../lib/aqondPayFees.js';
import { isPaysoEnabledFromEnv } from '../lib/paysoEnvFlag.js';
import { logPayment } from '../lib/logger.js';

let paysoDepositStatusPathMisconfigWarned = false;

/** @returns {boolean} */
export function isPaysoPayoutEnabled() {
  return isPaysoEnabledFromEnv();
}

export function getPaysoConfig() {
  const baseUrl = String(process.env.PAYSO_API_BASE_URL || '').trim().replace(/\/$/, '');
  const merchantId = String(process.env.PAYSO_MERCHANT_ID || '').trim();
  const apiKey = String(process.env.PAYSO_API_KEY || process.env.PAYSO_SECRET_KEY || '').trim();
  const path = String(process.env.PAYSO_PROMPTPAY_PAYOUT_PATH || '/api/v1/payouts/promptpay').trim();
  const authMode = (process.env.PAYSO_AUTH_MODE || 'bearer').toLowerCase();
  const amountUnit = (process.env.PAYSO_AMOUNT_UNIT || 'thb').toLowerCase();
  return {
    baseUrl,
    merchantId,
    apiKey,
    path: path.startsWith('/') ? path : `/${path}`,
    authMode,
    amountUnit,
    headerName: String(process.env.PAYSO_API_KEY_HEADER || 'X-API-Key').trim(),
  };
}

function getPaysoWebhookPublicUrl() {
  const explicit = String(process.env.PAYSO_WEBHOOK_PUBLIC_URL || '').trim();
  if (explicit) return explicit;
  const base = String(
    process.env.BACKEND_PUBLIC_URL ||
    process.env.PUBLIC_BASE_URL ||
    process.env.API_PUBLIC_URL ||
    ''
  )
    .trim()
    .replace(/\/$/, '');
  if (!base) return '';
  return `${base}/api/webhooks/payso`;
}

/**
 * Payso expects a stable unique reference per order (often up to 12 numeric digits).
 * @param {string} payoutRequestId UUID
 */
export function buildPaysoReferenceId(payoutRequestId) {
  const h = crypto.createHash('sha256').update(String(payoutRequestId)).digest('hex');
  const n = BigInt(`0x${h.slice(0, 14)}`) % 1000000000000n;
  return String(n).padStart(12, '0');
}

/**
 * @param {Record<string, unknown>} bankDetails
 * @returns {string} digits-only PromptPay / mobile id
 */
export function extractPromptPayId(bankDetails) {
  if (!bankDetails || typeof bankDetails !== 'object') return '';
  const bd = bankDetails;
  const candidates = [
    bd.promptpay_id,
    bd.promptPayId,
    bd.prompt_pay,
    bd.promptpay,
    bd.phone,
    bd.mobile,
    bd.account_number,
    bd.accountNumber,
  ];
  for (const c of candidates) {
    let s = String(c || '').replace(/\D/g, '');
    if (s.length >= 15) s = s.slice(-15);
    if (s.startsWith('66') && s.length >= 11) s = `0${s.slice(2)}`;
    if (s.length >= 10) return s;
  }
  return '';
}

/**
 * Build Authorization / merchant headers for Payso REST.
 */
function buildAuthHeaders(cfg) {
  const { apiKey, merchantId, authMode, headerName } = cfg;
  if (!apiKey) return { headers: {}, err: 'PAYSO_API_KEY not configured' };
  if (authMode === 'basic') {
    const token = Buffer.from(`${merchantId}:${apiKey}`, 'utf8').toString('base64');
    return { headers: { Authorization: `Basic ${token}` } };
  }
  if (authMode === 'header') {
    return { headers: { [headerName]: apiKey, merchant_id: merchantId } };
  }
  return { headers: { Authorization: `Bearer ${apiKey}` } };
}

function httpsJsonRequest(url, { method = 'POST', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(url);
    } catch (e) {
      return reject(new Error('invalid PAYSO_API_BASE_URL'));
    }
    const data = body != null ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: `${u.pathname}${u.search}`,
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...headers,
          ...(data ? { 'Content-Length': Buffer.byteLength(data, 'utf8') } : {}),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => {
          raw += c;
        });
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch {
            parsed = { raw };
          }
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body: parsed,
            raw,
          });
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

/**
 * Send PromptPay payout (None-UI). Maps AQOND payout_request_id → reference_id.
 *
 * @param {object} payoutData
 * @param {string} payoutData.payout_request_id
 * @param {number} payoutData.amount
 * @param {Record<string, unknown>} [payoutData.bank_details]
 * @param {string} [payoutData.customer_email]
 * @returns {Promise<{ ok: boolean, statusCode: number, data: object|null, payso_reference_id: string, payso_transaction_id: string|null, error: string|null }>}
 */
export async function sendPromptPayPayout(payoutData) {
  const cfg = getPaysoConfig();
  if (!cfg.baseUrl) {
    return {
      ok: false,
      statusCode: 0,
      data: null,
      payso_reference_id: '',
      payso_transaction_id: null,
      error: 'PAYSO_API_BASE_URL not configured',
    };
  }
  const auth = buildAuthHeaders(cfg);
  if (auth.err) {
    return {
      ok: false,
      statusCode: 0,
      data: null,
      payso_reference_id: '',
      payso_transaction_id: null,
      error: auth.err,
    };
  }

  const payout_id = String(payoutData.payout_request_id || '').trim();
  const reference_id = buildPaysoReferenceId(payout_id);
  const amountNum = parseFloat(payoutData.amount);
  const amount =
    cfg.amountUnit === 'satang' ? Math.round(amountNum * 100) : Math.round(amountNum * 100) / 100;
  const promptpay_id = extractPromptPayId(payoutData.bank_details || {});
  if (!promptpay_id) {
    return {
      ok: false,
      statusCode: 0,
      data: null,
      payso_reference_id: reference_id,
      payso_transaction_id: null,
      error: 'promptpay_id_not_found_in_bank_details',
    };
  }

  const payload = {
    merchant_id: cfg.merchantId,
    reference_id,
    reference_no: reference_id,
    refno: reference_id,
    amount,
    currency: 'THB',
    promptpay_id,
    promptpay: promptpay_id,
    customer_email: payoutData.customer_email || undefined,
    description: `AQOND payout ${payout_id}`,
    metadata: { payout_request_id: payout_id, source: 'aqond' },
  };

  const url = `${cfg.baseUrl}${cfg.path}`;
  console.log('[PAYSO deposit url]', url);
  const res = await httpsJsonRequest(url, {
    method: 'POST',
    headers: {
      ...auth.headers,
      ...(cfg.merchantId ? { 'X-Merchant-Id': cfg.merchantId } : {}),
    },
    body: payload,
  });

  const body = res.body && typeof res.body === 'object' ? res.body : {};
  const txId =
    body.transaction_id ||
    body.transactionId ||
    body.payso_transaction_id ||
    body.id ||
    body.data?.transaction_id ||
    null;

  const errMsg =
    body.error ||
    body.message ||
    body.error_message ||
    body.error_message_th ||
    (body.error_code != null && body.error_code !== 0 && String(body.error_code).toUpperCase() !== 'SUCCESS'
      ? body.error_code
      : null) ||
    (typeof body.errors === 'string' ? body.errors : null);

  const okHttp = res.statusCode >= 200 && res.statusCode < 300;
  if (okHttp && !errMsg) {
    return {
      ok: true,
      statusCode: res.statusCode,
      data: body,
      payso_reference_id: reference_id,
      payso_transaction_id: txId ? String(txId) : null,
      error: null,
    };
  }

  return {
    ok: false,
    statusCode: res.statusCode,
    data: body,
    payso_reference_id: reference_id,
    payso_transaction_id: txId ? String(txId) : null,
    error: errMsg || `payso_http_${res.statusCode}`,
  };
}

/**
 * Verify Payso webhook HMAC (raw body).
 * @param {Buffer} rawBody
 * @param {import('http').IncomingHttpHeaders} headers
 */
export function verifyPaysoWebhookSignature(rawBody, headers) {
  const secret = String(process.env.PAYSO_WEBHOOK_SECRET || '').trim();
  if (!secret) return false;
  const headerName = (process.env.PAYSO_WEBHOOK_SIGNATURE_HEADER || 'x-payso-signature').toLowerCase();
  let sig =
    headers[headerName] ||
    headers['x-payso-signature'] ||
    headers['x-signature'] ||
    headers['x-hub-signature-256'];
  if (Array.isArray(sig)) sig = sig[0];
  if (!sig) return false;

  const buf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');
  const expectedHex = crypto.createHmac('sha256', secret).update(buf).digest('hex');
  const normalized = String(sig)
    .replace(/^sha256=/i, '')
    .trim()
    .toLowerCase();

  const tryHex = Buffer.from(normalized, 'hex');
  const expBuf = Buffer.from(expectedHex, 'hex');
  if (tryHex.length === expBuf.length) {
    try {
      return crypto.timingSafeEqual(tryHex, expBuf);
    } catch {
      /* fall through */
    }
  }
  return normalized === expectedHex.toLowerCase() || String(sig) === expectedHex;
}

/**
 * Normalize webhook JSON — field names vary by Payso version.
 */
export function parsePaysoWebhookPayload(body) {
  if (!body || typeof body !== 'object') return null;
  const nested = body.data && typeof body.data === 'object' ? body.data : {};
  const reference_id = String(
    body.reference_id ||
    nested.reference_id ||
    body.reference_no ||
    body.refno ||
    body.ref_no ||
    body.referenceId ||
    ''
  ).trim();
  const transaction_id = String(
    body.transaction_id ||
    nested.transaction_id ||
    body.transactionId ||
    body.payso_transaction_id ||
    body.txn_id ||
    ''
  ).trim();
  const statusRaw = String(
    body.status || nested.status || body.payment_status || body.state || ''
  ).toLowerCase();
  const slip_url = String(
    body.slip_url ||
    nested.slip_url ||
    body.slipUrl ||
    body.confirmation_url ||
    body.confirmation_image_url ||
    body.payment_slip_url ||
    body.slip_image_url ||
    ''
  ).trim();
  return {
    reference_id,
    transaction_id,
    status: statusRaw,
    slip_url: slip_url || null,
    raw: body,
  };
}

/** REST path for wallet deposit (receive PromptPay / QR). */
export function getPaysoDepositPath() {
  const p = String(process.env.PAYSO_DEPOSIT_PATH || process.env.PAYSO_WALLET_DEPOSIT_PATH || '/api/v2/promptpaynew').trim();
  return p.startsWith('/') ? p : `/${p}`;
}

/** REST path for deposit status check (must be configured by merchant docs). */
export function getPaysoDepositStatusPath() {
  const p = String(process.env.PAYSO_DEPOSIT_STATUS_PATH || '').trim();
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  return p.startsWith('/') ? p : `/${p}`;
}

/** REST path for PaySo Mobile / Internet Banking deposit None-UI — set from Pay Solutions merchant documentation. */
export function getPaysoMobileBankingDepositPath() {
  const p = String(process.env.PAYSO_MOBILE_BANKING_DEPOSIT_PATH || '').trim();
  if (!p) return '';
  return p.startsWith('/') ? p : `/${p}`;
}

function resolvePaySoMbBankUpstreamCode(internalBankCode) {
  const bc = String(internalBankCode || '').trim().toLowerCase();
  const defaults = {
    scb: 'SCB',
    ktb: 'KTB',
    bbl: 'BBL',
    bay: 'BAY',
    kbank: 'KBANK',
  };
  /** @type {Record<string, string>} */
  let map = { ...defaults };
  try {
    const raw = String(process.env.PAYSO_MOBILE_BANKING_BANK_MAP_JSON || '').trim();
    if (raw) {
      const j = JSON.parse(raw);
      if (j && typeof j === 'object') map = { ...map, ...j };
    }
  } catch (_) {
    /* ignore invalid JSON */
  }
  const v = map[bc];
  return typeof v === 'string' && v.trim() ? v.trim() : bc.toUpperCase();
}

function extractRedirectUrlFromPaySoMbBody(body) {
  const b = body && typeof body === 'object' ? body : {};
  const nested = b.data && typeof b.data === 'object' ? b.data : {};
  const candidates = [
    b.paymentUrl,
    b.payment_url,
    b.redirect_url,
    b.redirectUrl,
    b.authorize_uri,
    b.authorization_uri,
    b.url,
    b.link,
    b.paymentLink,
    nested.paymentUrl,
    nested.payment_url,
    nested.redirect_url,
    nested.redirectUrl,
    nested.authorize_uri,
    nested.authorization_uri,
    nested.url,
    nested.paymentLink,
  ];
  for (const c of candidates) {
    const s = String(c || '').trim();
    if (s.startsWith('http://') || s.startsWith('https://')) return s;
  }
  return '';
}

/** Same QR / image extraction as PromptPay deposit response (PaySo tep promptpaynew / variants). */
function extractPaysoPromptPayStyleQrFromBody(body) {
  if (!body || typeof body !== 'object') return null;
  const nested = body.data && typeof body.data === 'object' ? body.data : {};
  const imageBase64 = body.image || nested.image || body.QRImage || nested.QRImage || null;
  const imageDataUrl =
    typeof imageBase64 === 'string' && imageBase64.trim()
      ? imageBase64.trim().startsWith('data:image/')
        ? imageBase64.trim()
        : `data:image/png;base64,${imageBase64.trim()}`
      : null;
  const qr =
    imageDataUrl ||
    body.qr_code_url ||
    body.qr_image_url ||
    body.qrcode_url ||
    body.image_url ||
    body.qr_url ||
    nested.qr_code_url ||
    nested.qr_image_url ||
    nested.image_url ||
    null;
  return qr ? String(qr) : null;
}

/**
 * PaySo wallet top-up via Mobile/Internet Banking None-UI (separate path from PromptPay QR).
 * Requires PAYSO_MOBILE_BANKING_DEPOSIT_PATH — parameter names align with typical Pay Solutions TEP patterns;
 * adjust PAYSO_MOBILE_BANKING_* env keys if your merchant doc differs.
 */
export async function createPaysoMobileBankingDepositCharge({
  amountThb,
  userUuid,
  customerEmail,
  bankCode,
  bankAccountNumber,
}) {
  const cfg = getPaysoConfig();
  const path = getPaysoMobileBankingDepositPath();
  if (!cfg.baseUrl) {
    return {
      ok: false,
      error: 'PAYSO_API_BASE_URL not configured',
      payso_reference_id: '',
      authorization_uri: null,
      data: null,
      statusCode: 0,
    };
  }
  if (!path) {
    return {
      ok: false,
      error: 'PAYSO_MOBILE_BANKING_DEPOSIT_PATH not configured',
      payso_reference_id: '',
      authorization_uri: null,
      data: null,
      statusCode: 0,
    };
  }
  const auth = buildAuthHeaders(cfg);
  if (auth.err) {
    return {
      ok: false,
      error: auth.err,
      payso_reference_id: '',
      authorization_uri: null,
      data: null,
      statusCode: 0,
    };
  }

  const reference_id = buildPaysoReferenceId(`${userUuid}-mb-${Date.now()}`);
  const paysoReferenceNo = String(reference_id).replace(/^0/, '1');
  const amt = parseFloat(amountThb);
  const amount = cfg.amountUnit === 'satang' ? Math.round(amt * 100) : Math.round(amt * 100) / 100;
  const feeEstimate = calcDepositFeeBreakdown(amount, 'payso');
  const safeEmail = String(customerEmail || '').trim() || 'noreply@aqond.com';
  const safeName = 'AQOND User';
  const productDetailRaw = `AQOND wallet MB deposit ${String(userUuid || '').trim()}`.trim();
  const productDetail = productDetailRaw
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 256);
  const total = Number(Math.round(Number(amount) * 100) / 100);

  const bankUpstream = resolvePaySoMbBankUpstreamCode(bankCode);
  const bankQueryKey = String(process.env.PAYSO_MOBILE_BANKING_BANK_QUERY_KEY || 'bankCode').trim() || 'bankCode';
  const accountQueryKey =
    String(process.env.PAYSO_MOBILE_BANKING_ACCOUNT_QUERY_KEY || 'bankAccountNo').trim() || 'bankAccountNo';

  const qs = new URLSearchParams({
    merchantID: String(cfg.merchantId || '').trim(),
    productDetail,
    customerEmail: safeEmail,
    customerName: safeName,
    total: String(total.toFixed(2)),
    referenceNo: paysoReferenceNo,
  });
  qs.set(bankQueryKey, bankUpstream);
  qs.set(accountQueryKey, String(bankAccountNumber || '').replace(/\D/g, ''));

  const webhookUrl = getPaysoWebhookPublicUrl();
  if (webhookUrl) {
    qs.set('callbackUrl', webhookUrl);
    qs.set('callback_url', webhookUrl);
    qs.set('webhookUrl', webhookUrl);
    qs.set('webhook_url', webhookUrl);
    qs.set('notifyUrl', webhookUrl);
    qs.set('notify_url', webhookUrl);
  }

  const url = `${cfg.baseUrl}${path}?${qs.toString()}`;

  logPayment('payso_mb_deposit_request', {
    user_id: String(userUuid || ''),
    payso_mb_path: path,
    bank_internal: String(bankCode || ''),
    reference_tail: paysoReferenceNo.slice(-4),
    amount: Number(amount),
  });

  const res = await httpsJsonRequest(url, {
    method: 'POST',
    headers: {
      ...auth.headers,
      ...(cfg.merchantId ? { 'X-Merchant-Id': cfg.merchantId } : {}),
    },
    body: null,
  });

  const body = res.body && typeof res.body === 'object' ? res.body : {};
  const redirect = extractRedirectUrlFromPaySoMbBody(body);
  const qr = extractPaysoPromptPayStyleQrFromBody(body);
  const okHttp = res.statusCode >= 200 && res.statusCode < 300;
  /** Do not treat generic `message` as failure — PaySo often echoes human text alongside QR/redirect payloads. */
  const fatalErr =
    body.error ||
    body.error_message ||
    (typeof body.errors === 'string' ? body.errors : null);

  if (okHttp && !fatalErr && (redirect || qr)) {
    if (redirect) {
      return {
        ok: true,
        payso_reference_id: paysoReferenceNo,
        authorization_uri: redirect,
        qr_code_url: qr || null,
        data: { ...body, aqond_fee_estimate: feeEstimate },
        statusCode: res.statusCode,
      };
    }
    return {
      ok: true,
      payso_reference_id: paysoReferenceNo,
      authorization_uri: null,
      qr_code_url: qr,
      data: { ...body, aqond_fee_estimate: feeEstimate },
      statusCode: res.statusCode,
    };
  }

  let errOut = fatalErr ? String(fatalErr).trim() : '';
  if (!errOut && okHttp && !(redirect || qr)) {
    errOut =
      String(body.message || '').trim() ||
      (typeof body.raw === 'string' && body.raw.length ? 'payso_mb_non_json_body' : '') ||
      'payso_mb_no_redirect_or_qr';
  }
  if (!errOut) errOut = `payso_mb_http_${res.statusCode}`;

  return {
    ok: false,
    error: errOut,
    payso_reference_id: paysoReferenceNo,
    authorization_uri: redirect || null,
    qr_code_url: qr || null,
    data: body,
    statusCode: res.statusCode,
  };
}

function urlPathnameSafe(value) {
  try {
    return new URL(String(value || '')).pathname || '';
  } catch {
    return '';
  }
}

function parsePaysoPaidFlag(body) {
  const first = Array.isArray(body) ? body[0] : body;
  const src = first && typeof first === 'object' ? first : {};
  const nested = src.data && typeof src.data === 'object' ? src.data : {};
  const statusRaw = String(
    src.status ||
    nested.status ||
    src.Status ||
    nested.Status ||
    src.payment_status ||
    nested.payment_status ||
    src.state ||
    nested.state ||
    src.StatusName ||
    nested.StatusName ||
    ''
  )
    .trim()
    .toLowerCase();
  const paidStates = new Set([
    'success',
    'successful',
    'succeeded',
    'paid',
    'completed',
    'complete',
    'charge.complete',
    'charge_completed',
    'settled',
    'cp',
    'y',
  ]);
  const paidByStatus = paidStates.has(statusRaw);
  const paidByFlag =
    src.paid === true ||
    nested.paid === true ||
    src.success === true ||
    nested.success === true ||
    src.is_paid === true ||
    nested.is_paid === true;
  const txnId =
    src.transaction_id ||
    nested.transaction_id ||
    src.transactionId ||
    nested.transactionId ||
    src.payso_transaction_id ||
    nested.payso_transaction_id ||
    src.ReferenceNo ||
    nested.ReferenceNo ||
    src.OrderNo ||
    nested.OrderNo ||
    null;
  return {
    paid: paidByStatus || paidByFlag,
    status: statusRaw || null,
    transaction_id: txnId ? String(txnId) : null,
  };
}

function getPaysoCardSecretKey() {
  return String(
    process.env.PAYSO_SECRET_KEY ||
    process.env.PAYSO_MERCHANT_SECRET_KEY ||
    ''
  ).trim();
}

function getPaysoCardPaymentPageUrl() {
  const raw = String(
    process.env.PAYSO_CARD_PAYMENT_URL ||
    process.env.PAYSO_CARD_REDIRECT_URL ||
    'https://www.thaiepay.com/epaylink/payment.aspx'
  ).trim();
  return raw.replace(/\/$/, '');
}

/** refno 10 หลักสำหรับหน้า PaySo redirect (thaiepay epaylink) */
export function buildPaysoRedirectRefNo(userUuid, channelTag = 'pay') {
  const ref = buildPaysoReferenceId(`${userUuid}-${channelTag}-${Date.now()}`);
  return String(ref).replace(/^0/, '1').padStart(10, '0').slice(-10);
}

/** @deprecated use buildPaysoRedirectRefNo */
export function buildPaysoCardRefNo(userUuid) {
  return buildPaysoRedirectRefNo(userUuid, 'card');
}

/** ค่า default สำหรับ pre-select ช่องทางบนหน้า thaiepay (override ด้วย PAYSO_*_REDIRECT_FORM_JSON) */
const PAYSO_REDIRECT_CHANNEL_DEFAULTS = {
  truemoney: { paymenttype: 'truemoney' },
  mobile_banking: { paymenttype: 'ibanking' },
  card: {},
};

function parsePaysoRedirectExtraFormFields(envKey) {
  try {
    const raw = String(process.env[envKey] || '').trim();
    if (!raw) return {};
    const j = JSON.parse(raw);
    if (!j || typeof j !== 'object' || Array.isArray(j)) return {};
    /** @type {Record<string, string>} */
    const out = {};
    for (const [k, v] of Object.entries(j)) {
      if (v != null && String(k).trim()) out[String(k)] = String(v);
    }
    return out;
  } catch (_) {
    return {};
  }
}

function resolvePaysoRedirectExtraFormFields(channel) {
  const envKey =
    channel === 'truemoney'
      ? 'PAYSO_TRUEMONEY_REDIRECT_FORM_JSON'
      : channel === 'mobile_banking'
        ? 'PAYSO_MOBILE_BANKING_REDIRECT_FORM_JSON'
        : channel === 'card'
          ? 'PAYSO_CARD_REDIRECT_FORM_JSON'
          : '';
  const defaults = PAYSO_REDIRECT_CHANNEL_DEFAULTS[channel] || {};
  const fromEnv = envKey ? parsePaysoRedirectExtraFormFields(envKey) : {};
  return { ...defaults, ...fromEnv };
}

/** HMAC-SHA512 base64 — merchantId + refno + total (WooCommerce Pay-Solutions plugin) */
export function buildPaysoCardPaymentHash(merchantId, refNo, totalThb, secretKey) {
  const total = Number(totalThb).toFixed(2);
  return crypto
    .createHmac('sha512', String(secretKey || ''))
    .update(String(merchantId || '') + String(refNo || '') + total)
    .digest('base64');
}

function httpsFormPostRedirect(url, formBody) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(url);
    } catch (e) {
      return reject(new Error('invalid card payment URL'));
    }
    const data = String(formBody || '');
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: `${u.pathname}${u.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(data, 'utf8'),
          Accept: 'text/html,application/json',
        },
      },
      (res) => {
        res.resume();
        res.on('end', () => {
          const loc = res.headers.location;
          let authorizationUri = null;
          if (loc) {
            authorizationUri = loc.startsWith('http') ? loc : `${u.protocol}//${u.hostname}${loc.startsWith('/') ? '' : '/'}${loc}`;
          }
          resolve({
            statusCode: res.statusCode || 0,
            authorization_uri: authorizationUri,
          });
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/**
 * Wallet top-up ผ่าน Pay Solutions hosted redirect (บัตร / TrueMoney / Mobile Banking)
 * ใช้ Secret Key + Merchant ID จาก dashboard (thaiepay epaylink — ไม่ใช่ Omise /tokens)
 */
export async function createPaysoRedirectWalletDepositCharge({
  amountThb,
  userUuid,
  customerEmail,
  returnUrl,
  channel = 'card',
  extraFormFields = {},
  productDetail: productDetailOverride,
}) {
  const cfg = getPaysoConfig();
  const merchantId = String(cfg.merchantId || '').trim();
  const secretKey = getPaysoCardSecretKey();
  const paymentPageUrl = getPaysoCardPaymentPageUrl();

  if (!merchantId) {
    return { ok: false, error: 'PAYSO_MERCHANT_ID not configured', payso_reference_id: '', authorization_uri: null };
  }
  if (!secretKey) {
    return { ok: false, error: 'PAYSO_SECRET_KEY not configured', payso_reference_id: '', authorization_uri: null };
  }

  const amt = parseFloat(amountThb);
  const amount = cfg.amountUnit === 'satang' ? Math.round(amt * 100) / 100 : Math.round(amt * 100) / 100;
  if (!(amount >= 1)) {
    return { ok: false, error: 'amount_below_minimum', payso_reference_id: '', authorization_uri: null };
  }

  const channelTag =
    channel === 'truemoney' ? 'tm' : channel === 'mobile_banking' ? 'mb' : 'card';
  const refNo = buildPaysoRedirectRefNo(userUuid, channelTag);
  const total = amount.toFixed(2);
  const hash = buildPaysoCardPaymentHash(merchantId, refNo, total, secretKey);
  const safeEmail = String(customerEmail || '').trim() || 'noreply@aqond.com';
  const productDetail = (
    productDetailOverride ||
    `AQOND wallet ${channel} deposit ${String(userUuid || '').trim()}`
  ).slice(0, 256);
  const lang = String(process.env.PAYSO_CARD_PAYMENT_LANG || 't').trim() || 't';

  const formBody = new URLSearchParams({
    merchantid: merchantId,
    total,
    productdetail: productDetail,
    cc: String(process.env.PAYSO_CARD_CURRENCY_CODE || '00'),
    customeremail: safeEmail,
    refno: refNo,
    ...(returnUrl ? { returnurl: String(returnUrl).trim() } : {}),
    hash,
    ...extraFormFields,
  }).toString();

  const postUrl = `${paymentPageUrl}?lang=${encodeURIComponent(lang)}`;
  logPayment('payso_redirect_deposit_request', {
    user_id: String(userUuid || ''),
    ref_no: refNo,
    channel: String(channel || ''),
    amount: Number(total),
    payment_host: (() => {
      try {
        return new URL(postUrl).host;
      } catch {
        return null;
      }
    })(),
  });

  try {
    const res = await httpsFormPostRedirect(postUrl, formBody);
    if ((res.statusCode === 302 || res.statusCode === 301) && res.authorization_uri) {
      logPayment('payso_redirect_deposit_ok', {
        ref_no: refNo,
        channel: String(channel || ''),
        status_code: res.statusCode,
        has_auth_uri: true,
      });
      return {
        ok: true,
        payso_reference_id: refNo,
        // datainclusion auto-POSTs to PaySo /payment in the browser, which loads order
        // details (refno, amount, product) before redirecting to channel picker.
        authorization_uri: res.authorization_uri,
        statusCode: res.statusCode,
      };
    }
    return {
      ok: false,
      error: `payso_redirect_http_${res.statusCode || 0}`,
      payso_reference_id: refNo,
      authorization_uri: res.authorization_uri || null,
      statusCode: res.statusCode,
    };
  } catch (e) {
    return {
      ok: false,
      error: e?.message || 'payso_redirect_failed',
      payso_reference_id: refNo,
      authorization_uri: null,
    };
  }
}

/** Wallet top-up ด้วยบัตรเครดิต/เดบิต — redirect ไปหน้า Pay Solutions */
export async function createPaysoCardWalletDepositCharge(params) {
  return createPaysoRedirectWalletDepositCharge({ ...params, channel: 'card' });
}

/** Wallet top-up ด้วย TrueMoney — redirect hosted page + pre-select TrueMoney */
export async function createPaysoTrueMoneyWalletDepositCharge(params) {
  return createPaysoRedirectWalletDepositCharge({
    ...params,
    channel: 'truemoney',
    extraFormFields: resolvePaysoRedirectExtraFormFields('truemoney'),
  });
}

/** Wallet top-up ด้วย Mobile Banking — redirect hosted page + pre-select iBanking */
export async function createPaysoMobileBankingRedirectWalletDepositCharge(params) {
  return createPaysoRedirectWalletDepositCharge({
    ...params,
    channel: 'mobile_banking',
    extraFormFields: resolvePaysoRedirectExtraFormFields('mobile_banking'),
  });
}

/**
 * Create wallet top-up via Pay Solutions deposit API (same host/auth as payout).
 * QR / image URL field names vary by API version — we try several.
 */
export async function createPaysoWalletDepositCharge({ amountThb, userUuid, customerEmail, productDetail: productDetailOverride }) {
  const cfg = getPaysoConfig();
  const path = getPaysoDepositPath();

  if (!cfg.baseUrl) {
    return { ok: false, error: 'PAYSO_API_BASE_URL not configured', payso_reference_id: '', qr_code_url: null, data: null };
  }
  const auth = buildAuthHeaders(cfg);
  if (auth.err) {
    return { ok: false, error: auth.err, payso_reference_id: '', qr_code_url: null, data: null };
  }

  // PaySo PromptPay API: /api/v2/promptpaynew
  // Docs require: Authorization: Bearer <auth> and query params:
  // merchantID, productDetail, customerEmail, customerName, total, referenceNo
  const reference_id = buildPaysoReferenceId(`${userUuid}-${Date.now()}`);
  const paysoReferenceNo = String(reference_id).replace(/^0/, '1');
  const amt = parseFloat(amountThb);
  const amount = cfg.amountUnit === 'satang' ? Math.round(amt * 100) : Math.round(amt * 100) / 100;

  logPayment('payso_deposit_config_snapshot', {
    hypothesis_id: 'H6',
    user_id: String(userUuid || ''),
    payso_base_host: (() => {
      try {
        return new URL(cfg.baseUrl).host;
      } catch {
        return null;
      }
    })(),
    payso_deposit_path: path,
    payso_auth_mode: cfg.authMode,
    payso_amount_unit: cfg.amountUnit,
    merchant_id_present: !!cfg.merchantId,
    api_key_present: !!cfg.apiKey,
    amount: Number(amount),
  });

  /** ค่าธรรมเนียมผู้ใช้ = MDR PromptPay ตาม Payment Provider Gate + Match markup % (aqondPayFees) */
  const feeEstimate = calcDepositFeeBreakdown(amount, 'payso');
  const safeEmail = String(customerEmail || '').trim() || 'noreply@aqond.com';
  const safeName = 'AQOND User';
  const productDetailRaw =
    productDetailOverride || `AQOND wallet deposit ${String(userUuid || '').trim()}`.trim();
  const productDetail = productDetailRaw
    .replace(/[<>]/g, '')
    .replace(/\\s+/g, ' ')
    .slice(0, 256);
  const total = Number(Math.round(Number(amount) * 100) / 100);

  const qs = new URLSearchParams({
    merchantID: String(cfg.merchantId || '').trim(),
    productDetail,
    customerEmail: safeEmail,
    customerName: safeName,
    total: String(total.toFixed(2)),
    referenceNo: paysoReferenceNo,
  });
  const webhookUrl = getPaysoWebhookPublicUrl();
  if (webhookUrl) {
    qs.set('callbackUrl', webhookUrl);
    qs.set('callback_url', webhookUrl);
    qs.set('webhookUrl', webhookUrl);
    qs.set('webhook_url', webhookUrl);
    qs.set('notifyUrl', webhookUrl);
    qs.set('notify_url', webhookUrl);
  }

  const url = `${cfg.baseUrl}${path}?${qs.toString()}`;

  logPayment('payso_deposit_debug_url', {
    url: String(url),
    merchantID: String(cfg.merchantId || '').trim(),
    hasAuthHeader: !!auth?.headers?.Authorization,
    hasWebhookUrl: !!webhookUrl,
  });

  console.log('[PAYSO promptpaynew url]', url);
  const res = await httpsJsonRequest(url, {
    method: 'POST',
    headers: {
      ...auth.headers,
      ...(cfg.merchantId ? { 'X-Merchant-Id': cfg.merchantId } : {}),
    },
    body: null,
  });

  const body = res.body && typeof res.body === 'object' ? res.body : {};
  logPayment('payso_deposit_upstream_snapshot', {
    hypothesis_id: 'H7',
    status_code: Number(res.statusCode || 0),
    body_code: body?.code ?? null,
    body_error: String(body?.error || body?.message || body?.error_message || '').slice(0, 240),
    has_data: !!(body?.data && typeof body.data === 'object'),
    www_authenticate: String(res?.headers?.['www-authenticate'] || ''),
    response_server: String(res?.headers?.server || ''),
  });

  const nested = body.data && typeof body.data === 'object' ? body.data : {};
  const imageBase64 = body.image || nested.image || body.QRImage || nested.QRImage || null;
  const imageDataUrl =
    typeof imageBase64 === 'string' && imageBase64.trim()
      ? imageBase64.trim().startsWith('data:image/')
        ? imageBase64.trim()
        : `data:image/png;base64,${imageBase64.trim()}`
      : null;
  const qr =
    imageDataUrl ||
    body.qr_code_url ||
    body.qr_image_url ||
    body.qrcode_url ||
    body.image_url ||
    body.qr_url ||
    nested.qr_code_url ||
    nested.qr_image_url ||
    nested.image_url ||
    null;

  const okHttp = res.statusCode >= 200 && res.statusCode < 300;
  const errMsg =
    body.error ||
    body.message ||
    body.error_message ||
    (typeof body.errors === 'string' ? body.errors : null);

  if (okHttp && !errMsg) {
    return {
      ok: true,
      payso_reference_id: paysoReferenceNo,
      qr_code_url: qr ? String(qr) : null,
      data: { ...body, aqond_fee_estimate: feeEstimate },
      statusCode: res.statusCode,
    };
  }
  return {
    ok: false,
    error: errMsg || `payso_deposit_http_${res.statusCode}`,
    payso_reference_id: paysoReferenceNo,
    qr_code_url: qr ? String(qr) : null,
    data: body,
    statusCode: res.statusCode,
  };
}

/**
 * Verify a wallet-deposit charge status directly with PaySo API.
 * Requires PAYSO_DEPOSIT_STATUS_PATH configured (merchant-specific).
 */
export async function queryPaysoWalletDepositStatus({ referenceId }) {
  const cfg = getPaysoConfig();
  const rawStatusPath = getPaysoDepositStatusPath();
  const depositPath = getPaysoDepositPath();
  const ref = String(referenceId || '').trim();
  if (!ref) {
    return { ok: false, statusCode: 0, paid: false, status: null, transaction_id: null, error: 'missing_reference_id', data: null };
  }
  if (!cfg.baseUrl) {
    return { ok: false, statusCode: 0, paid: false, status: null, transaction_id: null, error: 'PAYSO_API_BASE_URL not configured', data: null };
  }
  if (!rawStatusPath) {
    return { ok: false, statusCode: 0, paid: false, status: null, transaction_id: null, error: 'PAYSO_DEPOSIT_STATUS_PATH not configured', data: null };
  }
  const isMethodWord = /^(GET|POST|PUT|PATCH|DELETE)$/i.test(String(rawStatusPath || '').trim());
  const normalizedPath = isMethodWord ? depositPath : rawStatusPath;
  const pathWarning = isMethodWord
    ? `PAYSO_DEPOSIT_STATUS_PATH looks like HTTP method (${rawStatusPath}); using PAYSO_DEPOSIT_PATH as fallback`
    : null;
  const isAbsoluteStatusUrl = /^https?:\/\//i.test(normalizedPath);
  const sameAsDepositCreatePath = normalizedPath === depositPath;
  if (sameAsDepositCreatePath) {
    const configWarning =
      pathWarning ||
      'PAYSO_DEPOSIT_STATUS_PATH points to PAYSO_DEPOSIT_PATH (deposit-create endpoint)';
    if (!paysoDepositStatusPathMisconfigWarned) {
      paysoDepositStatusPathMisconfigWarned = true;
      console.warn('[PaySo] deposit status path misconfigured:', {
        depositPath,
        rawStatusPath,
        normalizedPath,
      });
      logPayment('payso_deposit_status_path_misconfigured', {
        deposit_path: depositPath,
        raw_status_path: rawStatusPath,
        normalized_path: normalizedPath,
      });
    }
    return {
      ok: false,
      statusCode: 0,
      paid: false,
      status: null,
      transaction_id: null,
      error: 'PAYSO_DEPOSIT_STATUS_PATH points to deposit-create endpoint',
      userMessage: 'ระบบตรวจสอบสถานะ PaySo ยังไม่ได้ตั้งค่า endpoint สำหรับเช็คสถานะ',
      method: null,
      path: normalizedPath,
      config_warning: configWarning,
      data: null,
    };
  }
  const isPaySolutionsOrderDetailPost =
    /\/order\/orderdetailpost$/i.test(normalizedPath) ||
    /\/order\/orderdetailpost$/i.test(urlPathnameSafe(normalizedPath));
  const auth = buildAuthHeaders(cfg);
  if (auth.err) {
    return { ok: false, statusCode: 0, paid: false, status: null, transaction_id: null, error: auth.err, data: null };
  }
  const qs = new URLSearchParams({
    merchantID: String(cfg.merchantId || '').trim(),
    referenceNo: ref,
    reference_id: ref,
    referenceId: ref,
  });
  const url = isAbsoluteStatusUrl ? normalizedPath : `${cfg.baseUrl}${normalizedPath}?${qs.toString()}`;
  const inquiryMerchantId = String(process.env.PAYSO_INQUIRY_MERCHANT_ID || cfg.merchantId || '').trim().slice(-5);
  const merchantSecretKey = String(
    process.env.PAYSO_MERCHANT_SECRET_KEY ||
    process.env.PAYSO_INQUIRY_MERCHANT_SECRET_KEY ||
    process.env.PAYSO_WEBHOOK_SECRET ||
    ''
  ).trim();
  const inquiryApiKey = String(process.env.PAYSO_INQUIRY_API_KEY || cfg.apiKey || '').trim();
  const headers = {
    ...(isAbsoluteStatusUrl ? {} : auth.headers),
    ...(cfg.merchantId ? { 'X-Merchant-Id': cfg.merchantId } : {}),
    ...(inquiryMerchantId ? { merchantID: inquiryMerchantId } : {}),
    ...(merchantSecretKey ? { merchantSecretKey } : {}),
    ...(inquiryApiKey ? { apikey: inquiryApiKey } : {}),
  };
  const reqBody = {
    merchantID: inquiryMerchantId || String(cfg.merchantId || '').trim(),
    orderNo: ref,
    refno: ref,
    productDetail: `AQOND wallet deposit ${ref}`,
  };
  const preferredMethod = String(
    process.env.PAYSO_DEPOSIT_STATUS_METHOD ||
    (isPaySolutionsOrderDetailPost ? 'POST' : (isMethodWord ? rawStatusPath : 'GET'))
  ).trim().toUpperCase();
  const firstMethod = preferredMethod === 'POST' ? 'POST' : 'GET';
  const secondMethod = firstMethod === 'GET' ? 'POST' : 'GET';

  const run = async (method) => {
    const r = await httpsJsonRequest(url, {
      method,
      headers,
      body: method === 'POST' ? reqBody : undefined,
    });
    const b = r.body && typeof r.body === 'object' ? r.body : {};
    const e =
      b.error ||
      b.message ||
      b.error_message ||
      (typeof b.errors === 'string' ? b.errors : null);
    return { method, response: r, body: b, errorMessage: e || null };
  };

  const first = await run(firstMethod);
  let chosen = first;
  if (first.response.statusCode === 405) {
    const second = await run(secondMethod);
    if (second.response.statusCode >= 200 && second.response.statusCode < 300) {
      chosen = second;
    } else if (second.response.statusCode !== 405) {
      chosen = second;
    }
  }

  const body = chosen.body;
  const parsed = parsePaysoPaidFlag(body);
  const okHttp = chosen.response.statusCode >= 200 && chosen.response.statusCode < 300;
  let errMsg = chosen.errorMessage;
  if (!errMsg && !okHttp) {
    errMsg = `payso_status_http_${chosen.response.statusCode}`;
    if (chosen.response.statusCode === 405) {
      errMsg = `payso_status_http_405_method_not_allowed:${chosen.method}`;
    }
  }
  if (!errMsg && normalizedPath === depositPath && chosen.response.statusCode === 405) {
    errMsg = 'PAYSO_DEPOSIT_STATUS_PATH likely points to deposit-create endpoint';
  }
  return {
    ok: okHttp && !errMsg,
    statusCode: chosen.response.statusCode,
    paid: parsed.paid,
    status: parsed.status,
    transaction_id: parsed.transaction_id,
    error: errMsg || null,
    userMessage: errMsg ? 'ระบบตรวจสอบสถานะ PaySo ชั่วคราวไม่สำเร็จ' : null,
    method: chosen.method,
    path: normalizedPath,
    config_warning: pathWarning,
    data: body,
  };
}
/**
 * Merge Payso API error into reconciliation_details and set FAIL.
 * @param {import('pg').Pool} pool
 * @param {string} payoutId
 * @param {object} errPayload
 */
export async function recordPaysoPayoutFailure(pool, payoutId, errPayload) {
  const row = await pool.query('SELECT reconciliation_details FROM payout_requests WHERE id::text = $1', [payoutId]);
  const prev = row.rows?.[0]?.reconciliation_details;
  let parsed = {};
  if (prev && typeof prev === 'object') parsed = { ...prev };
  else if (typeof prev === 'string') {
    try {
      parsed = JSON.parse(prev);
    } catch {
      parsed = {};
    }
  }
  parsed.payso = {
    ...(parsed.payso || {}),
    payout_error: {
      at: new Date().toISOString(),
      ...errPayload,
    },
  };
  await pool.query(
    `UPDATE payout_requests
     SET reconciliation_status = 'FAIL',
         reconciliation_details = $1::jsonb,
         reconciled_at = NOW()
     WHERE id = $2::uuid`,
    [JSON.stringify(parsed), payoutId]
  );
}
