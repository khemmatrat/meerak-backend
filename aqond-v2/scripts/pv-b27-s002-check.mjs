#!/usr/bin/env node
/** Return Core — B2.7-S002 OR002 refund detail */
const BASE = process.env.STOREFRONT_URL || 'http://127.0.0.1:3003';

const ORDER = {
  order_id: 'ord-pv27s002thai0001',
  buyer_id: 'buyer-pv27-s002',
  merchant_id: 'aqm-demo',
  merchant_name: 'ร้านค้า Aqond Demo',
  status: 'paid',
  payment_status: 'paid',
  amount_micro: 49800,
  method: 'promptpay',
  order_type: 'marketplace',
  created_at: '2026-07-02T14:00:00.000Z',
  items: [{ product_id: 'p1', title: 'ชา Matcha', qty: 1, unit_price_micro: 49800 }],
};

async function seed() {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const ordersFile = path.join(process.cwd(), 'apps', 'storefront', '.data', 'orders.json');
  let db = { orders: [], idempotency: {} };
  try {
    db = JSON.parse(await fs.readFile(ordersFile, 'utf8'));
  } catch {
    /* fresh */
  }
  const idx = db.orders.findIndex((o) => o.order_id === ORDER.order_id);
  if (idx >= 0) db.orders[idx] = ORDER;
  else db.orders.push(ORDER);
  await fs.mkdir(path.dirname(ordersFile), { recursive: true });
  await fs.writeFile(ordersFile, JSON.stringify(db, null, 2));

  const returnsFile = path.join(process.cwd(), 'apps', 'storefront', '.data', 'returns.json');
  try {
    const returns = JSON.parse(await fs.readFile(returnsFile, 'utf8'));
    returns.returns = (returns.returns || []).filter((r) => r.order_id !== ORDER.order_id);
    returns.refunds = (returns.refunds || []).filter((r) => r.order_id !== ORDER.order_id);
    await fs.writeFile(returnsFile, JSON.stringify(returns, null, 2));
  } catch {
    /* no returns file */
  }
}

async function main() {
  await seed();
  const checks = [];
  const push = (id, name, pass) => checks.push({ id, name, pass });

  const cfgRes = await fetch(`${BASE}/api/return/v1/config`);
  const cfg = await cfgRes.json().catch(() => ({}));
  push('OR002-1', 'refund_request enabled', cfg.capabilities?.refund_request?.enabled === true);

  const createRes = await fetch(`${BASE}/api/return/v1/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      order_id: ORDER.order_id,
      buyer_id: ORDER.buyer_id,
      merchant_id: ORDER.merchant_id,
      reason_code: 'damaged',
      return_method: 'home_pickup',
    }),
  });
  const created = await createRes.json().catch(() => ({}));
  push('OR002-2', 'Return creates linked refund', createRes.status === 201 && !!created.return?.refund_id);

  const refundId = created.return?.refund_id;
  const returnId = created.return?.return_id;

  const byRefundRes = await fetch(
    `${BASE}/api/return/v1/refunds/${refundId}?buyer_id=${ORDER.buyer_id}`,
  );
  const byRefund = await byRefundRes.json().catch(() => ({}));
  push('OR002-3', 'Refund detail by id', byRefundRes.ok && byRefund.refund?.state === 'escrow_held');
  push('OR002-4', 'Amount THB', byRefund.refund?.amount_thb === '498.00');
  push('OR002-5', 'Scenario tag', byRefund.scenario === 'B2.7-S002');

  const byReturnRes = await fetch(
    `${BASE}/api/return/v1/returns/${returnId}/refund?buyer_id=${ORDER.buyer_id}`,
  );
  const byReturn = await byReturnRes.json().catch(() => ({}));
  push('OR002-6', 'Refund detail by return', byReturnRes.ok && byReturn.refund?.return_id === returnId);

  const byOrderRes = await fetch(
    `${BASE}/api/return/v1/orders/${ORDER.order_id}/refund?buyer_id=${ORDER.buyer_id}`,
  );
  const byOrder = await byOrderRes.json().catch(() => ({}));
  push('OR002-7', 'Refund detail by order', byOrderRes.ok && byOrder.refund?.order_id === ORDER.order_id);
  push('OR002-8', 'Escrow held on create', byOrder.refund?.escrow_status === 'held');
  push('OR002-9', 'Thai state label', typeof byOrder.refund?.state_label_th === 'string');
  push('OR002-10', 'Refund id format', /^rfnd-/.test(refundId || ''));

  const status = checks.every((c) => c.pass) ? 'PASS' : 'FAIL';
  console.log(JSON.stringify({ scenario: 'B2.7-S002', mission: 'RETURN-REFUND-CORE', or_id: 'OR002', status, checks }, null, 2));
  process.exit(status === 'PASS' ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
