/**
 * ร่าง JSON สำหรับส่งไป Gateway (Payso / Ksher) — ปรับ field ให้ตรงเอกสารจริงของค่ายเมื่อได้รับ API spec
 */
import {
  normalizePaymentChannel,
  getLocalGatewayFromEnv,
} from './paymentProviderGate.js';

/**
 * Metadata มาตรฐานฝั่งเรา — แนบใน body ทุกครั้งเพื่ออ้างอิงย้อนหลัง + webhook
 * @param {{
 *   jobId?: string|number,
 *   orderId?: string,
 *   userId?: string,
 *   paymentChannel?: string,
 *   paymentGateway?: 'payso'|'ksher',
 *   idempotencyKey?: string,
 *   extra?: Record<string, unknown>,
 * }} p
 */
export function buildTransactionMetadata(p = {}) {
  const {
    jobId,
    orderId,
    userId,
    paymentChannel,
    paymentGateway,
    idempotencyKey,
    extra = {},
  } = p;
  const gw = paymentGateway || getLocalGatewayFromEnv();
  const ch = normalizePaymentChannel(paymentChannel);
  return {
    meerak_job_id: jobId != null ? String(jobId) : undefined,
    meerak_order_id: orderId != null ? String(orderId) : undefined,
    meerak_user_id: userId != null ? String(userId) : undefined,
    payment_channel: ch,
    payment_gateway: gw,
    idempotency_key: idempotencyKey,
    ...extra,
  };
}

/**
 * ร่าง body สำหรับ Payso — เปลี่ยนชื่อฟิลด์ตามเอกสารจริง (เช่น amount เป็น satang หรือสตางค์)
 */
export function buildPaysoChargeRequestDraft({
  amountThb,
  currency = 'THB',
  paymentChannel,
  metadata,
  notifyUrl,
  returnUrl,
  merchantOrderId,
  description,
}) {
  const ch = normalizePaymentChannel(paymentChannel);
  return {
    _schema: 'payso.charge.draft.v1',
    amount_thb: roundMoney(amountThb),
    currency: String(currency || 'THB').toUpperCase(),
    payment_method_hint: ch,
    merchant_order_ref: merchantOrderId,
    order_description: description,
    metadata: metadata || {},
    callback: {
      notify_url: notifyUrl,
      return_url: returnUrl,
    },
  };
}

/**
 * ร่าง body สำหรับ Ksher — เปลี่ยนชื่อฟิลด์ตามเอกสารจริง
 */
export function buildKsherChargeRequestDraft({
  amountThb,
  currency = 'THB',
  paymentChannel,
  metadata,
  notifyUrl,
  returnUrl,
  merchantOrderId,
  description,
}) {
  const ch = normalizePaymentChannel(paymentChannel);
  return {
    _schema: 'ksher.payment.draft.v1',
    total_amount: roundMoney(amountThb),
    currency: String(currency || 'THB').toUpperCase(),
    channel: ch,
    out_trade_no: merchantOrderId,
    subject: description,
    metadata: metadata || {},
    notify_url: notifyUrl,
    return_url: returnUrl,
  };
}

/**
 * เลือกร่างตามค่ายที่ใช้จริง
 * @param {'payso'|'ksher'} gateway
 */
export function buildGatewayChargePayload(gateway, args) {
  const gw = String(gateway || 'payso').toLowerCase().trim();
  if (gw === 'ksher') return buildKsherChargeRequestDraft(args);
  return buildPaysoChargeRequestDraft(args);
}

/**
 * รวม metadata เข้า body เดิมของ SDK / HTTP client
 */
export function mergeGatewayMetadata(baseBody, metadata) {
  const base = baseBody && typeof baseBody === 'object' ? baseBody : {};
  const meta = metadata && typeof metadata === 'object' ? metadata : {};
  return {
    ...base,
    metadata: { ...(base.metadata && typeof base.metadata === 'object' ? base.metadata : {}), ...meta },
  };
}

function roundMoney(v) {
  return Math.round((Number(v) + Number.EPSILON) * 100) / 100;
}
