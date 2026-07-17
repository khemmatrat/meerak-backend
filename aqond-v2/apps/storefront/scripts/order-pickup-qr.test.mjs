#!/usr/bin/env node
/** Sprint S2 — order pickup QR API (storefront :3003) */
const BASE = process.env.STOREFRONT_URL || 'http://127.0.0.1:3003';

async function json(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const list = await json(`${BASE}/api/merchant/orders?merchant_id=food-thai-1`);
  const food = (list.data.orders || []).find((o) => o.order_type === 'food');
  assert(food, 'need a food order in queue — run packing-proof test first');

  const orderId = food.order_id || food.id;
  const { res, data } = await json(
    `${BASE}/api/merchant/orders/${encodeURIComponent(orderId)}/pickup-qr?merchant_id=food-thai-1`,
  );
  assert(res.ok, `pickup-qr failed: ${JSON.stringify(data)}`);
  assert(data.payload?.order_id === orderId, 'payload order_id');
  assert(data.payload?.merchant_id === 'food-thai-1', 'payload merchant_id');
  assert(data.qr_image_url?.includes('qrserver.com'), 'qr image url');
  assert(data.encoded?.includes('aqond_food_pickup'), 'encoded payload');

  console.log('order-pickup-qr.test.mjs OK', orderId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
