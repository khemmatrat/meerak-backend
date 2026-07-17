#!/usr/bin/env node
/**
 * Sprint S16-S17 — event outbox + admin replay
 */
const BASE = process.env.STOREFRONT_URL || 'http://127.0.0.1:3003';
const ADMIN_KEY = process.env.AQOND_ADMIN_KEY || 'aqond-admin-dev';

async function main() {
  await fetch(`${BASE}/api/disputes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      order_id: `outbox-${Date.now()}`,
      merchant_id: 'food-thai-1',
      customer_id: 'outbox-test',
      order_type: 'food',
      category: 'missing_items',
      title: 'outbox test',
      description: 'event pipeline',
      order_total_micro: 1000000,
      items: [{ product_id: 'x', title: 'x', qty: 1, unit_price_micro: 1000000 }],
    }),
  });

  const replay = await fetch(`${BASE}/api/admin/events/replay?admin_key=${encodeURIComponent(ADMIN_KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit: 5 }),
  });
  const data = await replay.json();
  if (!replay.ok || !data.ok) throw new Error(`replay failed: ${JSON.stringify(data)}`);
  console.log('event-outbox.test.mjs OK processed', data.processed);
}

main().catch((e) => {
  console.error('event-outbox FAILED:', e.message);
  process.exit(1);
});
