#!/usr/bin/env node
/** Return Core — B2.7-S003 Escrow Adapter */
const BASE = process.env.STOREFRONT_URL || 'http://127.0.0.1:3003';

const ORDER = {
  order_id: 'ord-pv27s003thai0001',
  buyer_id: 'buyer-pv27-s003',
  merchant_id: 'aqm-demo',
  status: 'paid',
  payment_status: 'paid',
  amount_micro: 116900,
  method: 'promptpay',
  order_type: 'marketplace',
  created_at: '2026-07-02T15:00:00.000Z',
  items: [{ product_id: 'p1', title: 'สินค้าทดสอบ', qty: 1, unit_price_micro: 116900 }],
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

  for (const file of ['returns.json']) {
    const p = path.join(process.cwd(), 'apps', 'storefront', '.data', file);
    try {
      const raw = JSON.parse(await fs.readFile(p, 'utf8'));
      raw.returns = (raw.returns || []).filter((r) => r.order_id !== ORDER.order_id);
      raw.refunds = (raw.refunds || []).filter((r) => r.order_id !== ORDER.order_id);
      await fs.writeFile(p, JSON.stringify(raw, null, 2));
    } catch {
      /* fresh */
    }
  }
  await fetch(`${BASE}/api/return/v1/escrow/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_id: ORDER.order_id }),
  }).catch(() => null);
}

async function main() {
  await seed();
  const checks = [];
  const push = (id, name, pass) => checks.push({ id, name, pass });

  const escRes = await fetch(`${BASE}/api/return/v1/escrow`);
  const esc = await escRes.json().catch(() => ({}));
  push('S003-1', 'Escrow API 200', escRes.ok);
  push('S003-2', 'existing_escrow adapter', esc.adapter === 'existing_escrow');
  push('S003-3', 'rewrite blocked', esc.rewrite_allowed === false);
  push('S003-4', 'escrow_refund enabled', esc.escrow_refund_enabled === true);
  push('S003-5', 'Scenario tag', esc.scenario === 'B2.7-S003');

  const createRes = await fetch(`${BASE}/api/return/v1/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      order_id: ORDER.order_id,
      buyer_id: ORDER.buyer_id,
      merchant_id: ORDER.merchant_id,
      reason_code: 'not_as_described',
      return_method: 'kerry',
    }),
  });
  const created = await createRes.json().catch(() => ({}));
  push('S003-6', 'Return creates escrow hold', createRes.status === 201);

  const refundId = created.return?.refund_id;
  const refundRes = await fetch(
    `${BASE}/api/return/v1/refunds/${refundId}?buyer_id=${ORDER.buyer_id}`,
  );
  const refund = await refundRes.json().catch(() => ({}));
  push('S003-7', 'Refund state escrow_held', refund.refund?.state === 'escrow_held');
  push('S003-8', 'Escrow status held', refund.refund?.escrow_status === 'held');
  push('S003-9', 'Escrow reference set', /^esc-/.test(refund.refund?.escrow_reference || ''));

  const esc2 = await fetch(`${BASE}/api/return/v1/escrow`);
  const escBody = await esc2.json().catch(() => ({}));
  push('S003-10', 'Hold persisted', (escBody.hold_count || 0) >= 1);

  const status = checks.every((c) => c.pass) ? 'PASS' : 'FAIL';
  console.log(JSON.stringify({ scenario: 'B2.7-S003', mission: 'RETURN-REFUND-CORE', status, checks }, null, 2));
  process.exit(status === 'PASS' ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
