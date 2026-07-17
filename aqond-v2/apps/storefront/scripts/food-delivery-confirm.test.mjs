#!/usr/bin/env node
/**
 * Sprint S4 — delivery confirm, review gate, auto-confirm (storefront :3003)
 *   node scripts/food-delivery-confirm.test.mjs
 */
const BASE = process.env.STOREFRONT_URL || 'http://127.0.0.1:3003';

async function json(url, init) {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const orderId = `test-s4-${Date.now()}`;
  const startedAt = new Date(Date.now() - 110_000).toISOString();

  const start = await json(`${BASE}/api/food/tracking/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      order_id: orderId,
      buyer_id: 'buyer-s4',
      merchant_id: 'food-thai-1',
      merchant_name: 'ร้านทดสอบ S4',
      items_summary: 'ข้าวผัด x1',
      address: '123 ถนนทดสอบ',
      payment_method: 'promptpay',
      amount_micro: 12000,
      started_at: startedAt,
    }),
  });
  assert(start.res.ok, `start tracking: ${JSON.stringify(start.data)}`);

  let track = await json(`${BASE}/api/food/tracking/${encodeURIComponent(orderId)}`);
  assert(track.res.ok, 'track get');
  assert(track.data.can_confirm === true, `can_confirm: ${JSON.stringify(track.data)}`);
  assert(track.data.phase === 'awaiting_customer_confirm', `phase: ${track.data.phase}`);
  assert(track.data.can_review !== true, 'review blocked before confirm');

  const reviewBlocked = await json(`${BASE}/api/food/tracking/${encodeURIComponent(orderId)}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stars: 5, tip_micro: 1000 }),
  });
  assert(reviewBlocked.res.status === 409, 'review blocked until confirm');

  const confirm = await json(`${BASE}/api/food/tracking/${encodeURIComponent(orderId)}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ buyer_id: 'buyer-s4' }),
  });
  assert(confirm.res.ok, `confirm: ${JSON.stringify(confirm.data)}`);
  assert(confirm.data.customer_confirmed_at, 'customer_confirmed_at set');
  assert(confirm.data.can_review === true, 'can_review after confirm');
  assert(confirm.data.phase === 'review_pending', `phase after confirm: ${confirm.data.phase}`);

  const review = await json(`${BASE}/api/food/tracking/${encodeURIComponent(orderId)}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stars: 5, comment: 'ดีมาก', tip_micro: 2000 }),
  });
  assert(review.res.ok, `review: ${JSON.stringify(review.data)}`);
  assert(review.data.review?.stars === 5, 'review saved');

  track = await json(`${BASE}/api/food/tracking/${encodeURIComponent(orderId)}`);
  assert(track.data.phase === 'completed' || track.data.review, 'completed or has review');

  // Auto-confirm path
  const autoOrderId = `test-s4-auto-${Date.now()}`;
  await json(`${BASE}/api/food/tracking/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      order_id: autoOrderId,
      buyer_id: 'buyer-s4-auto',
      merchant_id: 'food-thai-1',
      merchant_name: 'ร้านทดสอบ S4',
      items_summary: 'ต้มยำ x1',
      address: '456 ถนนทดสอบ',
      started_at: startedAt,
    }),
  });

  const autoTrack = await json(`${BASE}/api/food/tracking/${encodeURIComponent(autoOrderId)}`);
  assert(autoTrack.data.auto_confirm_at, 'auto_confirm_at scheduled');

  console.log('S4 food-delivery-confirm: all checks passed');
}

main().catch((e) => {
  console.error('S4 food-delivery-confirm FAILED:', e.message);
  process.exit(1);
});
