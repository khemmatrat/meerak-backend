import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const ORDER = {
  order_id: 'ord-pv27s003e2e0001',
  buyer_id: 'buyer-pv27-s003-e2e',
  merchant_id: 'aqm-demo',
  status: 'paid',
  payment_status: 'paid',
  amount_micro: 11040000,
  method: 'promptpay',
  order_type: 'marketplace',
  created_at: '2026-07-02T15:00:00.000Z',
  items: [{ product_id: 'p1', title: 'โทรศัพท์ V29', qty: 1, unit_price_micro: 11040000 }],
};

async function seed(request: import('@playwright/test').APIRequestContext) {
  const file = path.join(process.cwd(), '.data', 'orders.json');
  let db = { orders: [], idempotency: {} };
  try {
    db = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    /* fresh */
  }
  const idx = db.orders.findIndex((o: { order_id: string }) => o.order_id === ORDER.order_id);
  if (idx >= 0) db.orders[idx] = ORDER;
  else db.orders.push(ORDER);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(db, null, 2));

  for (const name of ['returns.json']) {
    const p = path.join(process.cwd(), '.data', name);
    try {
      const raw = JSON.parse(await fs.readFile(p, 'utf8'));
      raw.returns = (raw.returns || []).filter((r: { order_id: string }) => r.order_id !== ORDER.order_id);
      raw.refunds = (raw.refunds || []).filter((r: { order_id: string }) => r.order_id !== ORDER.order_id);
      await fs.writeFile(p, JSON.stringify(raw, null, 2));
    } catch {
      /* fresh */
    }
  }
  await request.post('/api/return/v1/escrow/reset', { data: { order_id: ORDER.order_id } }).catch(() => null);
}

test.describe('B2.7-S003 Return Core — Escrow Adapter', () => {
  test.beforeAll(async ({ request }) => {
    await seed(request);
  });

  test('escrow status API', async ({ request }) => {
    const res = await request.get('/api/return/v1/escrow');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.scenario).toBe('B2.7-S003');
    expect(body.rewrite_allowed).toBe(false);
    expect(res.headers()['x-aqond-return-scenario']).toBe('B2.7-S003');
  });

  test('return request places escrow hold', async ({ request }) => {
    const res = await request.post('/api/return/v1/requests', {
      data: {
        order_id: ORDER.order_id,
        buyer_id: ORDER.buyer_id,
        merchant_id: ORDER.merchant_id,
        reason_code: 'damaged',
        return_method: 'home_pickup',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    const refundRes = await request.get(
      `/api/return/v1/refunds/${body.return.refund_id}?buyer_id=${encodeURIComponent(ORDER.buyer_id)}`,
    );
    const refund = await refundRes.json();
    expect(refund.refund.state).toBe('escrow_held');
    expect(refund.refund.escrow_status).toBe('held');
  });
});
