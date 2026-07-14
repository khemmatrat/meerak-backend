#!/usr/bin/env node
/** Receipt Core — B2.6-S002 marketplace production wiring */
import crypto from 'node:crypto';

const BASE = process.env.STOREFRONT_URL || 'http://127.0.0.1:3003';
const DEV_SECRET = 'aqond-receipt-verify-dev';

function signToken(orderId) {
  const secret = process.env.RECEIPT_VERIFY_SECRET || DEV_SECRET;
  return crypto.createHmac('sha256', secret).update(orderId).digest('hex').slice(0, 20);
}

function verifyQs(orderId, buyerId) {
  const qs = new URLSearchParams({ order_id: orderId, buyer_id: buyerId, v: signToken(orderId) });
  return qs.toString();
}

const THAI_ORDER = {
  order_id: 'ord-pv26s002thai0001',
  buyer_id: 'buyer-pv26',
  merchant_id: 'aqm-demo',
  merchant_name: 'ร้านค้า Aqond Demo',
  status: 'paid',
  payment_status: 'paid',
  amount_micro: 49800,
  method: 'promptpay',
  created_at: '2026-07-02T10:20:00.000Z',
  items: [
    { product_id: 'p1', title: 'ชา Matcha ออร์แกนิก', qty: 1, unit_price_micro: 29900 },
    { product_id: 'p2', title: 'White Chef Shirt', qty: 1, unit_price_micro: 19900 },
  ],
};

async function seedLocalOrder() {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const file = path.join(process.cwd(), 'apps', 'storefront', '.data', 'orders.json');
  let db = { orders: [], idempotency: {} };
  try {
    db = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    /* fresh */
  }
  const idx = db.orders.findIndex((o) => o.order_id === THAI_ORDER.order_id);
  const row = { ...THAI_ORDER, order_type: 'marketplace', created_at: THAI_ORDER.created_at };
  if (idx >= 0) db.orders[idx] = row;
  else db.orders.push(row);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(db, null, 2));
}

async function main() {
  await seedLocalOrder();

  const results = {
    scenario: 'B2.6-S002',
    mission: 'RECEIPT-CORE',
    receipt_type: 'R001',
    checks: [],
  };

  const push = (id, name, pass, extra = {}) => {
    results.checks.push({ id, name, pass, ...extra });
  };

  const verifyRes = await fetch(`${BASE}/api/receipt/v1/verify?${verifyQs(THAI_ORDER.order_id, THAI_ORDER.buyer_id)}`);
  const verifyBody = await verifyRes.json().catch(() => ({}));
  push('RC004', 'Verify API', verifyRes.ok && verifyBody.verified === true);
  push('RC004', 'Verify URL signed', String(verifyBody.verify_url || '').includes('v='));

  const pdfRes = await fetch(
    `${BASE}/api/orders/${encodeURIComponent(THAI_ORDER.order_id)}/receipt.pdf?buyer_id=${encodeURIComponent(THAI_ORDER.buyer_id)}`,
  );
  const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
  const pdfLatin = pdfBuf.toString('latin1');
  push('RC005', 'Production receipt route', pdfRes.ok && pdfRes.headers.get('x-aqond-receipt-scenario') === 'B2.6-S002');
  push('RC005', 'Route URL unchanged', pdfRes.url.includes('/receipt.pdf'));
  push('RC006', 'PDF magic', pdfBuf.slice(0, 4).toString() === '%PDF');
  push('RC002', 'No question-mark corruption', !pdfLatin.includes('?????'));
  push('RC001', 'R001 header', pdfRes.headers.get('x-aqond-receipt-type') === 'R001');
  push('RC010', 'Receipt Core header', pdfRes.headers.get('x-aqond-receipt-core') === 'receipt-core');

  const metaRes = await fetch(`${BASE}/api/receipt/v1/verify?${verifyQs(THAI_ORDER.order_id, THAI_ORDER.buyer_id)}`);
  const meta = await metaRes.json().catch(() => ({}));
  push('RC003', 'Metadata envelope', meta.metadata?.receipt_version === '1.0.0' && meta.metadata?.template_id === 'marketplace-v1');

  results.status = results.checks.every((c) => c.pass) ? 'PASS' : 'FAIL';
  console.log(JSON.stringify(results, null, 2));
  process.exit(results.status === 'PASS' ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
