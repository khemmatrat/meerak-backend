import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const ORDER_API = {
  order_id: 'ord-pv27s001e2e0001',
  buyer_id: 'buyer-pv27-e2e',
  merchant_id: 'aqm-demo',
  merchant_name: 'ร้านค้า Aqond Demo',
  status: 'paid',
  payment_status: 'paid',
  amount_micro: 49800,
  method: 'promptpay',
  order_type: 'marketplace',
  created_at: '2026-07-02T12:00:00.000Z',
  items: [{ product_id: 'p1', title: 'ชา Matcha', qty: 1, unit_price_micro: 49800 }],
};

const ORDER_UI = {
  ...ORDER_API,
  order_id: 'ord-pv27s001e2e0002',
};

async function seedOrder(order: typeof ORDER_API) {
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
    await fs.writeFile(returnsFile, JSON.stringify(returns, null, 2));
  } catch {
    /* no returns file */
  }
}

test.describe('B2.7-S001 Return Core — OR001 Return Request', () => {
  test.beforeAll(async () => {
    await seedOrder(ORDER_API);
    await seedOrder(ORDER_UI);
  });

  test('loads Return Core config', async ({ request }) => {
    const res = await request.get('/api/return/v1/config');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.core).toBe('return-core');
    expect(body.scenario).toBe('B2.7-S001');
    expect(body.capabilities.return_request.enabled).toBe(true);
    expect(res.headers()['x-aqond-return-core']).toBe('return-core');
  });

  test('creates return request for paid order', async ({ request }) => {
    const res = await request.post('/api/return/v1/requests', {
      data: {
        order_id: ORDER_API.order_id,
        buyer_id: ORDER_API.buyer_id,
        merchant_id: ORDER_API.merchant_id,
        reason_code: 'not_as_described',
        return_method: 'kerry',
        detail: 'E2E PV return',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.or_id).toBe('OR001');
    expect(body.return.state).toBe('requested');
    expect(body.return.return_id).toMatch(/^ret-/);
  });

  test('return request page submits successfully', async ({ page }) => {
    await page.goto(
      `/m/orders/${ORDER_UI.order_id}/return?buyer_id=${encodeURIComponent(ORDER_UI.buyer_id)}`,
    );
    await page.selectOption('select', { index: 0 });
    await page.getByRole('button', { name: 'ส่งคำขอคืนสินค้า' }).click();
    await expect(page.getByText('ส่งคำขอคืนสินค้าแล้ว')).toBeVisible({ timeout: 15000 });
  });
});
