import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const ORDER = {
  order_id: 'ord-pv27s002e2e0001',
  buyer_id: 'buyer-pv27-s002-e2e',
  merchant_id: 'aqm-demo',
  merchant_name: 'ร้านค้า Aqond Demo',
  status: 'paid',
  payment_status: 'paid',
  amount_micro: 75000,
  method: 'promptpay',
  order_type: 'marketplace',
  created_at: '2026-07-02T14:00:00.000Z',
  items: [{ product_id: 'p1', title: 'เสื้อเชิ้ต', qty: 1, unit_price_micro: 75000 }],
};

let seededRefundId = '';

async function seed(order: typeof ORDER) {
  const file = path.join(process.cwd(), '.data', 'orders.json');
  let db = { orders: [], idempotency: {} };
  try {
    db = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    /* fresh */
  }
  const idx = db.orders.findIndex((o: { order_id: string }) => o.order_id === order.order_id);
  if (idx >= 0) db.orders[idx] = order;
  else db.orders.push(order);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(db, null, 2));

  const returnsFile = path.join(process.cwd(), '.data', 'returns.json');
  try {
    const returns = JSON.parse(await fs.readFile(returnsFile, 'utf8'));
    returns.returns = (returns.returns || []).filter(
      (r: { order_id: string }) => r.order_id !== order.order_id,
    );
    returns.refunds = (returns.refunds || []).filter(
      (r: { order_id: string }) => r.order_id !== order.order_id,
    );
    await fs.writeFile(returnsFile, JSON.stringify(returns, null, 2));
  } catch {
    /* no returns file */
  }
}

test.describe('B2.7-S002 Return Core — OR002 Refund Detail', () => {
  test.beforeAll(async ({ request }) => {
    await seed(ORDER);
    const res = await request.post('/api/return/v1/requests', {
      data: {
        order_id: ORDER.order_id,
        buyer_id: ORDER.buyer_id,
        merchant_id: ORDER.merchant_id,
        reason_code: 'wrong_item',
        return_method: 'kerry',
      },
    });
    const body = await res.json();
    seededRefundId = body.return?.refund_id || '';
  });

  test('return request auto-creates refund detail', async ({ request }) => {
    expect(seededRefundId).toMatch(/^rfnd-/);
    const res = await request.get(
      `/api/return/v1/refunds/${seededRefundId}?buyer_id=${encodeURIComponent(ORDER.buyer_id)}`,
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.refund.state).toBe('escrow_held');
    expect(body.refund.amount_thb).toBe('750.00');
  });

  test('refund detail API returns OR002 envelope', async ({ request }) => {
    const res = await request.get(
      `/api/return/v1/orders/${ORDER.order_id}/refund?buyer_id=${encodeURIComponent(ORDER.buyer_id)}`,
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.or_id).toBe('OR002');
    expect(body.scenario).toBe('B2.7-S002');
    expect(body.refund.escrow_status).toBe('held');
    expect(res.headers()['x-aqond-return-scenario']).toBe('B2.7-S002');
  });

  test('refund detail page renders for order', async ({ page }) => {
    await page.goto(
      `/m/orders/${ORDER.order_id}/refund?buyer_id=${encodeURIComponent(ORDER.buyer_id)}`,
    );
    await expect(page.getByRole('heading', { name: 'รายละเอียดการคืนเงิน' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('750.00')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'อยู่ระหว่างการคืนเงิน' })).toBeVisible();
  });
});
