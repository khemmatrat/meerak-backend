#!/usr/bin/env node
/**
 * Sprint S8 — Track OS SSE streams (storefront :3003)
 */
const BASE = process.env.STOREFRONT_URL || 'http://127.0.0.1:3003';
const ADMIN_KEY = process.env.AQOND_ADMIN_KEY || 'aqond-admin-dev';

async function main() {
  const list = await fetch(`${BASE}/api/admin/food/orders?admin_key=${encodeURIComponent(ADMIN_KEY)}&limit=1`);
  const data = await list.json();
  const orderId = data.orders?.[0]?.order_id || data.orders?.[0]?.id;
  if (!orderId) throw new Error('need order');

  const adminStream = await fetch(
    `${BASE}/api/admin/food/orders/${encodeURIComponent(orderId)}/events/stream?admin_key=${encodeURIComponent(ADMIN_KEY)}`,
    { headers: { Accept: 'text/event-stream' } },
  );
  if (!adminStream.ok) throw new Error(`admin sse ${adminStream.status}`);
  const reader = adminStream.body?.getReader();
  if (!reader) throw new Error('no admin stream body');
  const { value } = await reader.read();
  reader.cancel().catch(() => null);
  const text = new TextDecoder().decode(value || new Uint8Array());
  if (!text.includes('data:')) throw new Error('admin sse no data frame');

  const customerStream = await fetch(
    `${BASE}/api/food/tracking/${encodeURIComponent(orderId)}/stream`,
    { headers: { Accept: 'text/event-stream' } },
  );
  if (!customerStream.ok) throw new Error(`customer sse ${customerStream.status}`);

  console.log('track-os-sse.test.mjs OK', orderId);
}

main().catch((e) => {
  console.error('track-os-sse FAILED:', e.message);
  process.exit(1);
});
