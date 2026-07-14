#!/usr/bin/env node
/** Return Core — B2.7-S001 OR001 return request */
const BASE = process.env.STOREFRONT_URL || 'http://127.0.0.1:3003';

const ORDER = {
  order_id: 'ord-pv27s001thai0001',
  buyer_id: 'buyer-pv27-s001',
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

async function seedOrder() {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const file = path.join(process.cwd(), 'apps', 'storefront', '.data', 'orders.json');
  let db = { orders: [], idempotency: {} };
  try {
    db = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    /* fresh */
  }
  const idx = db.orders.findIndex((o) => o.order_id === ORDER.order_id);
  if (idx >= 0) db.orders[idx] = ORDER;
  else db.orders.push(ORDER);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(db, null, 2));

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
  await seedOrder();
  const checks = [];
  const push = (id, name, pass, extra = {}) => checks.push({ id, name, pass, ...extra });

  const cfgRes = await fetch(`${BASE}/api/return/v1/config`);
  const cfg = await cfgRes.json().catch(() => ({}));
  push('OR001-1', 'Config API 200', cfgRes.ok);
  push('OR001-2', 'Return Core mission', cfg.mission === 'RETURN-REFUND-CORE');
  push('OR001-3', 'return_request enabled', cfg.capabilities?.return_request?.enabled === true);
  push('OR001-4', 'Scenario tag', cfg.scenario === 'B2.7-S001');
  push('OR001-5', 'Escrow rewrite blocked', cfg.escrow?.rewrite_allowed === false);

  const createRes = await fetch(`${BASE}/api/return/v1/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      order_id: ORDER.order_id,
      buyer_id: ORDER.buyer_id,
      merchant_id: ORDER.merchant_id,
      reason_code: 'damaged',
      return_method: 'home_pickup',
      detail: 'PV test return',
    }),
  });
  const created = await createRes.json().catch(() => ({}));
  push('OR001-6', 'Create return 201', createRes.status === 201);
  push('OR001-7', 'State requested', created.return?.state === 'requested');
  push('OR001-8', 'Return id format', /^ret-/.test(created.return?.return_id || ''));

  const dupRes = await fetch(`${BASE}/api/return/v1/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      order_id: ORDER.order_id,
      buyer_id: ORDER.buyer_id,
      merchant_id: ORDER.merchant_id,
      reason_code: 'wrong_item',
    }),
  });
  push('OR001-9', 'Reject duplicate active return', dupRes.status === 409);

  const listRes = await fetch(
    `${BASE}/api/return/v1/requests?order_id=${ORDER.order_id}&buyer_id=${ORDER.buyer_id}`,
  );
  const list = await listRes.json().catch(() => ({}));
  push('OR001-10', 'List returns for order', listRes.ok && (list.returns?.length || 0) >= 1);

  const status = checks.every((c) => c.pass) ? 'PASS' : 'FAIL';
  console.log(JSON.stringify({ scenario: 'B2.7-S001', mission: 'RETURN-REFUND-CORE', or_id: 'OR001', status, checks }, null, 2));
  process.exit(status === 'PASS' ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
