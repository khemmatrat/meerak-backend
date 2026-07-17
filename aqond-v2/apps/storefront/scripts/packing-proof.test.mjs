#!/usr/bin/env node
/**
 * Sprint S1 — packing proof gate (storefront :3003).
 *   node scripts/packing-proof.test.mjs
 */
const BASE = process.env.STOREFRONT_URL || 'http://127.0.0.1:3003';

const TINY_JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=';

async function json(url, init) {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function placeFoodOrder() {
  const ts = Date.now();
  const body = {
    buyer_id: `pack-proof-${ts}`,
    merchant_id: 'food-thai-1',
    merchant_name: 'ครัวบ้านสวน',
    method: 'cod',
    amount_micro: 5000000,
    shipping_micro: 2500000,
    carrier_id: 'aqond-rider',
    order_type: 'food',
    recipient: 'ทดสอบ Packing Proof',
    phone: '0899999999',
    shipping_address: '456 ถ.สีลม กรุงเทพ',
    postal_code: '10500',
    idempotency_key: `pack-proof-${ts}`,
    items: [{ product_id: 'dish-padthai', title: 'ผัดไทย', qty: 1, unit_price_micro: 5000000 }],
  };
  const { res, data } = await json(`${BASE}/api/checkout/place`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert(res.ok && data.order_id, `place failed: ${JSON.stringify(data)}`);
  return data.order_id;
}

async function setFulfillment(orderId, status) {
  return json(`${BASE}/api/orders/${encodeURIComponent(orderId)}/fulfillment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, actor: 'pack-proof-test' }),
  });
}

async function main() {
  const orderId = await placeFoodOrder();

  let r = await setFulfillment(orderId, 'accepted');
  assert(r.res.ok, `accepted failed: ${JSON.stringify(r.data)}`);

  r = await setFulfillment(orderId, 'preparing');
  assert(r.res.ok, `preparing failed: ${JSON.stringify(r.data)}`);

  r = await setFulfillment(orderId, 'ready');
  assert(r.res.status === 409, `ready without proof should 409, got ${r.res.status}`);
  assert(r.data.error === 'packing_proof_required', `expected packing_proof_required, got ${r.data.error}`);

  const up = await json(
    `${BASE}/api/merchant/orders/${encodeURIComponent(orderId)}/packing-proof?merchant_id=food-thai-1`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchant_id: 'food-thai-1',
        image_data_url: TINY_JPEG,
        actor: 'pack-proof-test',
      }),
    },
  );
  assert(up.res.ok && up.data.proof?.photo_url, `upload failed: ${JSON.stringify(up.data)}`);

  r = await setFulfillment(orderId, 'ready');
  assert(r.res.ok, `ready after proof failed: ${JSON.stringify(r.data)}`);

  const track = await json(`${BASE}/api/food/tracking/${encodeURIComponent(orderId)}`, { method: 'GET' });
  assert(
    track.data.packing_proof_url || track.data.has_packing_proof,
    'track should expose packing proof',
  );

  console.log('packing-proof.test.mjs OK', orderId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
