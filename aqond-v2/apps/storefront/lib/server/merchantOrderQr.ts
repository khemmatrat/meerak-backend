import crypto from 'node:crypto';

const DEV_SECRET = 'aqond-order-pickup-qr-dev';
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export type OrderPickupQrPayload = {
  type: 'aqond_food_pickup';
  order_id: string;
  merchant_id: string;
  exp: number;
  sig: string;
};

export function orderPickupQrSecret(): string {
  return process.env.ORDER_PICKUP_QR_SECRET || DEV_SECRET;
}

function signPayload(orderId: string, merchantId: string, exp: number, secret = orderPickupQrSecret()): string {
  const base = `${orderId}|${merchantId}|${exp}`;
  return crypto.createHmac('sha256', secret).update(base).digest('hex').slice(0, 24);
}

export function buildOrderPickupQrPayload(
  orderId: string,
  merchantId: string,
  opts?: { ttlMs?: number },
): OrderPickupQrPayload {
  const exp = Date.now() + (opts?.ttlMs ?? DEFAULT_TTL_MS);
  const sig = signPayload(orderId, merchantId, exp);
  return { type: 'aqond_food_pickup', order_id: orderId, merchant_id: merchantId, exp, sig };
}

export function encodeOrderPickupQr(payload: OrderPickupQrPayload): string {
  return JSON.stringify(payload);
}

export function decodeOrderPickupQr(raw: string): OrderPickupQrPayload | null {
  try {
    const parsed = JSON.parse(raw) as OrderPickupQrPayload;
    if (parsed?.type !== 'aqond_food_pickup') return null;
    if (!parsed.order_id || !parsed.merchant_id || !parsed.exp || !parsed.sig) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function validateOrderPickupQr(
  payload: OrderPickupQrPayload,
  secret = orderPickupQrSecret(),
): { ok: true } | { ok: false; code: string } {
  if (payload.type !== 'aqond_food_pickup') return { ok: false, code: 'invalid_type' };
  if (Date.now() > payload.exp) return { ok: false, code: 'qr_expired' };
  const expected = signPayload(payload.order_id, payload.merchant_id, payload.exp, secret);
  try {
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(payload.sig))) {
      return { ok: false, code: 'invalid_signature' };
    }
  } catch {
    return { ok: false, code: 'invalid_signature' };
  }
  return { ok: true };
}

export function orderPickupQrImageUrl(encodedPayload: string, size = 220): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(encodedPayload)}`;
}
