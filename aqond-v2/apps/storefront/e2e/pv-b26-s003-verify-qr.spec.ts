import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { receiptVerifyQs } from './helpers/receiptVerify';

const THAI_ORDER = {
  order_id: 'ord-pv26s003e2e0001',
  buyer_id: 'buyer-pv26-s003',
  merchant_id: 'aqm-demo',
  merchant_name: 'ร้านค้า Aqond Demo',
  status: 'paid',
  payment_status: 'paid',
  amount_micro: 49800,
  method: 'promptpay',
  order_type: 'marketplace',
  created_at: '2026-07-02T10:20:00.000Z',
  items: [
    { product_id: 'p1', title: 'ชา Matcha ออร์แกนิก', qty: 1, unit_price_micro: 29900 },
    { product_id: 'p2', title: 'เสื้อเชฟ สีขาว', qty: 1, unit_price_micro: 19900 },
  ],
};

async function seedOrder() {
  const file = path.join(process.cwd(), '.data', 'orders.json');
  let db = { orders: [], idempotency: {} };
  try {
    db = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    /* fresh */
  }
  const idx = db.orders.findIndex((o: { order_id: string }) => o.order_id === THAI_ORDER.order_id);
  if (idx >= 0) db.orders[idx] = THAI_ORDER;
  else db.orders.push(THAI_ORDER);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(db, null, 2));
}

test.describe('B2.6-S003 Receipt Core — Verify QR', () => {
  test.beforeAll(async () => {
    await seedOrder();
  });

  test('rejects verify without signed token', async ({ request }) => {
    const res = await request.get(
      `/api/receipt/v1/verify?order_id=${THAI_ORDER.order_id}&buyer_id=${encodeURIComponent(THAI_ORDER.buyer_id)}`,
    );
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.verified).toBe(false);
    expect(body.error).toBe('invalid_verify_token');
  });

  test('accepts signed verify token', async ({ request }) => {
    const qs = receiptVerifyQs(THAI_ORDER.order_id, THAI_ORDER.buyer_id);
    const res = await request.get(`/api/receipt/v1/verify?${qs}`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.verified).toBe(true);
    expect(body.scenario).toBe('B2.6-S003');
    expect(body.token_valid).toBe(true);
    expect(body.verify_url).toContain('v=');
  });

  test('verify page requires token in QR URL', async ({ page }) => {
    const qs = receiptVerifyQs(THAI_ORDER.order_id, THAI_ORDER.buyer_id);
    await page.goto(`/m/receipt/verify?${qs}`);
    await expect(page.getByText('ใบเสร็จถูกต้อง')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('B2.6-S003')).toBeVisible();
  });

  test('receipt PDF uses signed verify URL', async ({ request }) => {
    const res = await request.get(
      `/api/orders/${THAI_ORDER.order_id}/receipt.pdf?buyer_id=${encodeURIComponent(THAI_ORDER.buyer_id)}`,
    );
    expect(res.ok()).toBeTruthy();
    const verifyUrl = res.headers()['x-aqond-receipt-verify'] || '';
    expect(verifyUrl).toContain('v=');
    expect(verifyUrl).toContain('/m/receipt/verify');
  });
});
