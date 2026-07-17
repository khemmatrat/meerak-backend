#!/usr/bin/env node
/**
 * Sprint S5 — full M1 food happy path (storefront :3003)
 *   node scripts/food-happy-path.test.mjs
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
    buyer_id: `happy-path-${ts}`,
    merchant_id: 'food-thai-1',
    merchant_name: 'ครัวบ้านสวน',
    method: 'cod',
    amount_micro: 5000000,
    shipping_micro: 2500000,
    carrier_id: 'aqond-rider',
    order_type: 'food',
    recipient: 'ทดสอบ Happy Path',
    phone: '0899999999',
    shipping_address: '456 ถ.สีลom กรุงเทพ',
    postal_code: '10500',
    idempotency_key: `happy-path-${ts}`,
    items: [{ product_id: 'dish-padthai', title: 'ผัดไทย', qty: 1, unit_price_micro: 5000000 }],
  };
  const { res, data } = await json(`${BASE}/api/checkout/place`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert(res.ok && data.order_id, `place failed: ${JSON.stringify(data)}`);
  return { orderId: data.order_id, buyerId: body.buyer_id };
}

async function setFulfillment(orderId, status) {
  return json(`${BASE}/api/orders/${encodeURIComponent(orderId)}/fulfillment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, actor: 'happy-path-test' }),
  });
}

async function main() {
  const { orderId, buyerId } = await placeFoodOrder();
  const merchantId = 'food-thai-1';

  // Merchant accept → prepare → packing proof → ready
  let r = await setFulfillment(orderId, 'accepted');
  assert(r.res.ok, 'accepted');
  r = await setFulfillment(orderId, 'preparing');
  assert(r.res.ok, 'preparing');

  const up = await json(
    `${BASE}/api/merchant/orders/${encodeURIComponent(orderId)}/packing-proof?merchant_id=${merchantId}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchant_id: merchantId,
        image_data_url: TINY_JPEG,
        actor: 'happy-path-test',
      }),
    },
  );
  assert(up.res.ok, `packing proof: ${JSON.stringify(up.data)}`);

  r = await setFulfillment(orderId, 'ready');
  assert(r.res.ok, 'ready after packing');

  // Merchant pickup QR
  const qr = await json(
    `${BASE}/api/merchant/orders/${encodeURIComponent(orderId)}/pickup-qr?merchant_id=${merchantId}`,
  );
  assert(qr.res.ok && qr.data.encoded, 'pickup qr');

  // Rider QR verify + pickup photo
  const verify = await json(`${BASE}/api/rider/orders/${encodeURIComponent(orderId)}/verify-pickup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      qr_payload: qr.data.encoded,
      rider_id: 'happy-path-rider',
      merchant_id: merchantId,
    }),
  });
  assert(verify.data.result === 'SUCCESS', `verify pickup: ${JSON.stringify(verify.data)}`);

  const photo = await json(`${BASE}/api/rider/orders/${encodeURIComponent(orderId)}/pickup-photo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_data_url: TINY_JPEG,
      rider_id: 'happy-path-rider',
      gps_lat: 13.72,
      gps_lng: 100.53,
    }),
  });
  assert(photo.res.ok, `pickup photo: ${JSON.stringify(photo.data)}`);

  // Customer tracking session (post-delivery sim)
  const startedAt = new Date(Date.now() - 110_000).toISOString();
  const start = await json(`${BASE}/api/food/tracking/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      order_id: orderId,
      buyer_id: buyerId,
      merchant_id: merchantId,
      merchant_name: 'ครัวบ้านสวน',
      items_summary: 'ผัดไทย x1',
      address: '456 ถ.สีลom',
      started_at: startedAt,
    }),
  });
  assert(start.res.ok, `tracking start: ${JSON.stringify(start.data)}`);

  let track = await json(`${BASE}/api/food/tracking/${encodeURIComponent(orderId)}`);
  assert(track.data.packing_proof_url || track.data.has_packing_proof, 'track packing');
  assert(track.data.pickup_verified_at || track.data.pickup_photo_url, 'track pickup');
  assert(track.data.can_confirm === true, 'awaiting customer confirm');

  const confirm = await json(`${BASE}/api/food/tracking/${encodeURIComponent(orderId)}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ buyer_id: buyerId }),
  });
  assert(confirm.res.ok && confirm.data.can_review, 'confirm unlocks review');

  const review = await json(`${BASE}/api/food/tracking/${encodeURIComponent(orderId)}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stars: 5, comment: 'happy path ok', tip_micro: 1000 }),
  });
  assert(review.res.ok && review.data.review, 'review submitted');

  track = await json(`${BASE}/api/food/tracking/${encodeURIComponent(orderId)}`);
  assert(track.data.review?.stars === 5, 'final track has review');

  // Merchant rider chat link API
  const chat = await json(
    `${BASE}/api/merchant/orders/${encodeURIComponent(orderId)}/rider-chat?merchant_id=${merchantId}`,
  );
  assert(chat.res.ok, 'rider-chat link api');

  console.log('food-happy-path.test.mjs OK', orderId);
}

main().catch((e) => {
  console.error('food-happy-path FAILED:', e.message);
  process.exit(1);
});
