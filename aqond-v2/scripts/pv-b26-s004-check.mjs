#!/usr/bin/env node
/** Receipt Core — B2.6-S004 Jarvis audit block */
import crypto from 'node:crypto';

const BASE = process.env.STOREFRONT_URL || 'http://127.0.0.1:3003';
const DEV_SECRET = 'aqond-receipt-verify-dev';

const ORDER = {
  order_id: 'ord-pv26s004thai0001',
  buyer_id: 'buyer-pv26-s004',
  merchant_id: 'aqm-demo',
  merchant_name: 'ร้านค้า Aqond Demo',
  status: 'paid',
  payment_status: 'paid',
  amount_micro: 49800,
  method: 'promptpay',
  created_at: '2026-07-02T10:20:00.000Z',
  items: [{ product_id: 'p1', title: 'ชา Matcha', qty: 1, unit_price_micro: 49800 }],
};

function signToken(orderId) {
  const secret = process.env.RECEIPT_VERIFY_SECRET || DEV_SECRET;
  return crypto.createHmac('sha256', secret).update(orderId).digest('hex').slice(0, 20);
}

async function seed() {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const file = path.join(process.cwd(), 'apps', 'storefront', '.data', 'orders.json');
  let db = { orders: [], idempotency: {} };
  try {
    db = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    /* fresh */
  }
  const row = { ...ORDER, order_type: 'marketplace' };
  const idx = db.orders.findIndex((o) => o.order_id === ORDER.order_id);
  if (idx >= 0) db.orders[idx] = row;
  else db.orders.push(row);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(db, null, 2));
}

async function main() {
  await seed();
  const checks = [];
  const push = (id, name, pass) => checks.push({ id, name, pass });

  const pdf = await fetch(
    `${BASE}/api/orders/${ORDER.order_id}/receipt.pdf?buyer_id=${ORDER.buyer_id}`,
  );
  const jarvis = pdf.headers.get('x-aqond-receipt-jarvis') || '';
  push('S004-1', 'Jarvis audit id on receipt', /^JRV-/.test(jarvis));
  push('S004-2', 'Jarvis header present', jarvis.length > 0);

  const qs = new URLSearchParams({ order_id: ORDER.order_id, buyer_id: ORDER.buyer_id, v: signToken(ORDER.order_id) });
  const verify = await fetch(`${BASE}/api/receipt/v1/verify?${qs}`);
  push('S004-3', 'Verify still works with Jarvis', verify.ok);

  const status = checks.every((c) => c.pass) ? 'PASS' : 'FAIL';
  console.log(JSON.stringify({ scenario: 'B2.6-S004', mission: 'RECEIPT-CORE', status, checks }, null, 2));
  process.exit(status === 'PASS' ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
