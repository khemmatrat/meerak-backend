#!/usr/bin/env node
/** Escrow DB concurrent write integrity test (requires storefront on :3003). */
const BASE = process.env.STOREFRONT_URL || 'http://127.0.0.1:3003';

async function main() {
  const res = await fetch(`${BASE}/api/dev/return/v1/escrow/self-test`, { method: 'POST' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.pass) {
    console.error('FAIL escrow concurrent self-test', body);
    process.exit(1);
  }
  console.log('PASS escrow concurrent self-test', {
    workers: body.workers,
    active_hold_count: body.active_hold_count,
    hold_ids: body.hold_ids,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
