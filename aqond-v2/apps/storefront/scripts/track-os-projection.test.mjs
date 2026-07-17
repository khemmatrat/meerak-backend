#!/usr/bin/env node
/**
 * Sprint S6 — Track OS projection + admin BFF (storefront :3003)
 *   node scripts/track-os-projection.test.mjs
 */
const BASE = process.env.STOREFRONT_URL || 'http://127.0.0.1:3003';
const ADMIN_KEY = process.env.AQOND_ADMIN_KEY || 'aqond-admin-dev';

async function json(url, init) {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const list = await json(`${BASE}/api/admin/food/orders?admin_key=${encodeURIComponent(ADMIN_KEY)}&limit=5`);
  assert(list.res.ok, `admin orders: ${JSON.stringify(list.data)}`);
  const orderId =
    list.data.orders?.[0]?.order_id ||
    list.data.orders?.[0]?.id;
  assert(orderId, 'need at least one food order');

  const track = await json(
    `${BASE}/api/admin/food/orders/${encodeURIComponent(orderId)}/track?admin_key=${encodeURIComponent(ADMIN_KEY)}`,
  );
  assert(track.res.ok && track.data.ok, `track BFF: ${JSON.stringify(track.data)}`);
  assert(track.data.order_id === orderId, 'order_id');
  assert(Array.isArray(track.data.timeline?.events), 'timeline.events');
  assert(Array.isArray(track.data.proofs), 'proofs array');
  assert(typeof track.data.realtime_seq === 'number', 'realtime_seq');

  const unauthorized = await json(
    `${BASE}/api/admin/food/orders/${encodeURIComponent(orderId)}/track`,
  );
  assert(unauthorized.res.status === 401, 'requires admin key');

  console.log('track-os-projection.test.mjs OK', orderId);
}

main().catch((e) => {
  console.error('track-os-projection FAILED:', e.message);
  process.exit(1);
});
