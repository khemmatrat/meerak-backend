import crypto from 'node:crypto';

const DEV_SECRET = 'aqond-receipt-verify-dev';

export function signReceiptVerifyTokenForTest(orderId: string): string {
  const secret = process.env.RECEIPT_VERIFY_SECRET || DEV_SECRET;
  return crypto.createHmac('sha256', secret).update(orderId).digest('hex').slice(0, 20);
}

export function receiptVerifyQs(orderId: string, buyerId: string): string {
  const qs = new URLSearchParams({
    order_id: orderId,
    buyer_id: buyerId,
    v: signReceiptVerifyTokenForTest(orderId),
  });
  return qs.toString();
}
