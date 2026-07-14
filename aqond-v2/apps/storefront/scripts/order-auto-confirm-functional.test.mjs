#!/usr/bin/env node
/** Functional ORDER-AUTO-CONFIRM job against local orders + stub escrow holds. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.STOREFRONT_URL || 'http://127.0.0.1:3003';
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ORDERS_FILE = path.join(ROOT, '..', '.data', 'orders.json');
const FULFILLMENT_FILE = path.join(ROOT, '..', '.data', 'dev', 'merchant-fulfillment.json');

async function seedPaidDeliveredOrder() {
  const buyerId = `oac-fn-${Date.now()}`;
  const idem = `oac-fn-${Date.now()}`;
  const place = await fetch(`${BASE}/api/checkout/place`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      buyer_id: buyerId,
      merchant_id: 'e2e-merchant',
      method: 'promptpay',
      amount_micro: 19900,
      shipping_micro: 3900,
      carrier_id: 'flash-th',
      idempotency_key: idem,
      recipient: 'OAC Functional',
      shipping_address: '1 Test',
      postal_code: '10110',
      phone: '0812345678',
      order_type: 'marketplace',
      items: [{ product_id: 'e2e-pdp-video-001', title: 'OAC', qty: 1, unit_price_micro: 19900 }],
    }),
  });
  const placed = await place.json();
  if (!place.ok || !placed.order_id) throw new Error(`place failed: ${JSON.stringify(placed)}`);

  const ref = placed.payment_action?.payso_reference_id || placed.payment_action?.ref;
  const sim = await fetch(`${BASE}/api/dev/checkout/payment/simulate-capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref, order_ids: [placed.order_id], buyer_id: buyerId }),
  });
  if (!sim.ok) throw new Error(`simulate failed: ${await sim.text()}`);

  const verify = await fetch(`${BASE}/api/checkout/payment/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ref,
      order_ids: [placed.order_id],
      buyer_id: buyerId,
      expires_at: Date.now() + 600000,
      amount: placed.payment_action?.amount || '238.00',
      intent_id: placed.payment_action?.intent_id,
      payso_reference_id: ref,
    }),
  });
  const verified = await verify.json();
  if (verified.status !== 'success') throw new Error(`verify failed: ${JSON.stringify(verified)}`);

  const deliveredAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const db = JSON.parse(await fs.readFile(ORDERS_FILE, 'utf8'));
  const hit = (db.orders || []).find((o) => o.order_id === placed.order_id);
  if (!hit) throw new Error('order missing after verify');
  hit.fulfillment_status = 'delivered';
  hit.delivered_at = deliveredAt;
  hit.status = 'completed';
  hit.buyer_confirmed_at = undefined;
  await fs.writeFile(ORDERS_FILE, JSON.stringify(db, null, 2));

  let fb = {};
  try {
    fb = JSON.parse(await fs.readFile(FULFILLMENT_FILE, 'utf8'));
  } catch {
    fb = {};
  }
  fb[placed.order_id] = {
    fulfillment_status: 'delivered',
    delivered_at: deliveredAt,
    updated_at: new Date().toISOString(),
  };
  await fs.mkdir(path.dirname(FULFILLMENT_FILE), { recursive: true });
  await fs.writeFile(FULFILLMENT_FILE, JSON.stringify(fb, null, 2));

  return { order_id: placed.order_id };
}

async function main() {
  const seeded = await seedPaidDeliveredOrder();

  const first = await fetch(`${BASE}/api/return/v1/jobs/run?job=order_auto_confirm`, { method: 'POST' });
  const firstBody = await first.json().catch(() => ({}));
  if (!first.ok) throw new Error(`job failed: ${JSON.stringify(firstBody)}`);
  const released1 = firstBody.order_auto_confirm?.released || [];
  if (!released1.includes(seeded.order_id)) {
    console.error('FAIL first run did not release order', firstBody.order_auto_confirm);
    process.exit(1);
  }

  const second = await fetch(`${BASE}/api/return/v1/jobs/run?job=order_auto_confirm`, { method: 'POST' });
  const secondBody = await second.json().catch(() => ({}));
  const dup2 = secondBody.order_auto_confirm?.duplicates || [];
  if (!dup2.includes(seeded.order_id)) {
    console.error('FAIL second run should be duplicate', secondBody.order_auto_confirm);
    process.exit(1);
  }

  console.log('PASS order auto-confirm functional job', {
    order_id: seeded.order_id,
    first_released: released1.length,
    second_duplicates: dup2.length,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
