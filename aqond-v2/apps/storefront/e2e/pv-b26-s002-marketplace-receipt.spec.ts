import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { receiptVerifyQs } from './helpers/receiptVerify';

const THAI_ORDER = {
  order_id: 'ord-pv26s002e2e0001',
  buyer_id: 'buyer-pv26-e2e',
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

test.describe('B2.6-S002 Receipt Core — Marketplace Production Wiring', () => {
  test.beforeAll(async () => {
    await seedOrder();
  });

  test('RC001–RC005: production receipt.pdf uses Receipt Core R001', async ({ request }) => {
    const url = `/api/orders/${THAI_ORDER.order_id}/receipt.pdf?buyer_id=${encodeURIComponent(THAI_ORDER.buyer_id)}`;
    const res = await request.get(url);
    expect(res.ok()).toBeTruthy();
    expect(res.headers()['x-aqond-receipt-core']).toBe('receipt-core');
    expect(res.headers()['x-aqond-receipt-scenario']).toBe('B2.6-S002');
    expect(res.headers()['x-aqond-receipt-type']).toBe('R001');
    expect(res.headers()['content-type']).toContain('application/pdf');

    const buf = Buffer.from(await res.body());
    expect(buf.slice(0, 4).toString()).toBe('%PDF');
    expect(buf.length).toBeGreaterThan(1000);
    const latin = buf.toString('latin1');
    expect(latin).not.toContain('?????');
    const counts = [...latin.matchAll(/\/Count\s+(\d+)/g)].map((m) => parseInt(m[1], 10));
    const pageCount = counts.length > 0 ? Math.max(...counts) : 1;
    expect(pageCount).toBe(1);
  });

  test('RC003: verify API returns metadata envelope', async ({ request }) => {
    const qs = receiptVerifyQs(THAI_ORDER.order_id, THAI_ORDER.buyer_id);
    const res = await request.get(`/api/receipt/v1/verify?${qs}`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.verified).toBe(true);
    expect(body.metadata.receipt_version).toBe('1.0.0');
    expect(body.metadata.template_id).toBe('marketplace-v1');
    expect(body.metadata.language).toBe('TH');
    expect(body.metadata.currency).toBe('THB');
    expect(body.metadata.timezone).toBe('Asia/Bangkok');
  });

  test('RC004: verify page loads for QR destination', async ({ page }) => {
    const qs = receiptVerifyQs(THAI_ORDER.order_id, THAI_ORDER.buyer_id);
    await page.goto(`/m/receipt/verify?${qs}`);
    await expect(page.getByText('ใบเสร็จถูกต้อง')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('AQOND Marketplace')).toBeVisible();
  });

  test('RC010: S001 engine preview still works (regression)', async ({ request }) => {
    const res = await request.get('/api/receipt/v1/engine/preview');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.scenario).toBe('B2.6-S001');
    expect(body.validation.ok).toBe(true);
  });
});
