import crypto from 'node:crypto';

const DEV_SECRET = 'aqond-receipt-verify-dev';

export function receiptVerifySecret(): string {
  return process.env.RECEIPT_VERIFY_SECRET || DEV_SECRET;
}

/** HMAC anti-forgery token for receipt verify QR (not payment). */
export function signReceiptVerifyToken(orderId: string, secret = receiptVerifySecret()): string {
  return crypto.createHmac('sha256', secret).update(orderId).digest('hex').slice(0, 20);
}

export function validateReceiptVerifyToken(
  orderId: string,
  token: string | null | undefined,
  secret = receiptVerifySecret(),
): boolean {
  if (!orderId || !token) return false;
  const expected = signReceiptVerifyToken(orderId, secret);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
  } catch {
    return false;
  }
}

export function buildSignedReceiptVerifyUrl(
  orderId: string,
  baseUrl: string,
  buyerId?: string,
): string {
  const base = baseUrl.replace(/\/$/, '');
  const token = signReceiptVerifyToken(orderId);
  const qs = new URLSearchParams({ order_id: orderId, v: token });
  if (buyerId) qs.set('buyer_id', buyerId);
  return `${base}/m/receipt/verify?${qs.toString()}`;
}
