#!/usr/bin/env node
/**
 * Sprint S16 — lifecycle projector worker (calls admin replay API)
 */
const BASE = process.env.STOREFRONT_URL || 'http://127.0.0.1:3003';
const ADMIN_KEY = process.env.AQOND_ADMIN_KEY || 'aqond-admin-dev';
const limit = Number(process.argv[2] || process.env.OUTBOX_BATCH_LIMIT || 50);

const res = await fetch(`${BASE}/api/admin/events/replay?admin_key=${encodeURIComponent(ADMIN_KEY)}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ limit }),
});
const data = await res.json();
if (!res.ok || !data.ok) {
  console.error(JSON.stringify({ ok: false, error: data }));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, ...data }));
