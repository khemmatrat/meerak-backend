#!/usr/bin/env node
/**
 * Sprint S3 — pickup verification (storefront :3003)
 *   node scripts/pickup-verification.test.mjs
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

async function getFoodOrderAndQr() {
  const list = await json(`${BASE}/api/merchant/orders?merchant_id=food-thai-1`);
  const food = (list.data.orders || []).find((o) => o.order_type === 'food');
  assert(food, 'need food order');
  const orderId = food.order_id || food.id;
  const qr = await json(
    `${BASE}/api/merchant/orders/${encodeURIComponent(orderId)}/pickup-qr?merchant_id=food-thai-1`,
  );
  assert(qr.res.ok && qr.data.encoded, 'pickup qr');
  return { orderId, encoded: qr.data.encoded, merchantId: 'food-thai-1' };
}

async function main() {
  const { orderId, encoded, merchantId } = await getFoodOrderAndQr();

  // Valid QR
  let v = await json(`${BASE}/api/rider/orders/${encodeURIComponent(orderId)}/verify-pickup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qr_payload: encoded, rider_id: 'test-rider-s3', merchant_id: merchantId }),
  });
  assert(v.data.result === 'SUCCESS', `valid qr: ${JSON.stringify(v.data)}`);

  // Duplicate scan / replay
  v = await json(`${BASE}/api/rider/orders/${encodeURIComponent(orderId)}/verify-pickup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qr_payload: encoded, rider_id: 'test-rider-s3' }),
  });
  assert(
    v.data.result === 'ORDER_ALREADY_PICKED_UP' || v.data.result === 'FAILED',
    `replay blocked: ${JSON.stringify(v.data)}`,
  );

  // Missing photo before depart — pickup-photo should work after qr
  const fresh = await getFoodOrderAndQr();
  await json(`${BASE}/api/rider/orders/${encodeURIComponent(fresh.orderId)}/verify-pickup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qr_payload: fresh.encoded, rider_id: 'test-rider-s3' }),
  });

  const photo = await json(
    `${BASE}/api/rider/orders/${encodeURIComponent(fresh.orderId)}/pickup-photo`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_data_url: TINY_JPEG,
        rider_id: 'test-rider-s3',
        gps_lat: 13.72,
        gps_lng: 100.53,
      }),
    },
  );
  assert(photo.res.ok && photo.data.pickup_photo_url, `pickup photo: ${JSON.stringify(photo.data)}`);

  const track = await json(`${BASE}/api/food/tracking/${encodeURIComponent(fresh.orderId)}`);
  assert(track.data.pickup_verified_at || track.data.pickup_photo_url, 'track exposes pickup');

  // Expired QR
  let expiredPayload;
  try {
    expiredPayload = JSON.parse(fresh.encoded);
    expiredPayload.exp = Date.now() - 1000;
  } catch {
    throw new Error('bad encoded');
  }
  const expiredOrder = await (async () => {
    const ts = Date.now();
    const place = await json(`${BASE}/api/checkout/place`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        buyer_id: `pv-exp-${ts}`,
        merchant_id: merchantId,
        method: 'cod',
        amount_micro: 5000000,
        shipping_micro: 2500000,
        carrier_id: 'aqond-rider',
        order_type: 'food',
        idempotency_key: `pv-exp-${ts}`,
        items: [{ product_id: 'dish-padthai', title: 'x', qty: 1, unit_price_micro: 5000000 }],
      }),
    });
    return place.data.order_id;
  })();

  expiredPayload.order_id = expiredOrder;
  v = await json(`${BASE}/api/rider/orders/${encodeURIComponent(expiredOrder)}/verify-pickup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qr_payload: JSON.stringify(expiredPayload), rider_id: 'test-rider-s3' }),
  });
  assert(v.data.result === 'EXPIRED' || v.data.result === 'INVALID_SIGNATURE', `expired: ${JSON.stringify(v.data)}`);

  console.log('pickup-verification.test.mjs OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
