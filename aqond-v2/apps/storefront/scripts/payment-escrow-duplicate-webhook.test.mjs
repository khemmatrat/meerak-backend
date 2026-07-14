#!/usr/bin/env node
/** Duplicate webhook delivery must not create double escrow holds (requires storefront on :3003). */
const BASE = process.env.STOREFRONT_URL || 'http://127.0.0.1:3003';

async function main() {
  const res = await fetch(`${BASE}/api/dev/checkout/payment/escrow-self-test`, { method: 'POST' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.pass) {
    console.error('FAIL payment escrow duplicate webhook self-test', body);
    process.exit(1);
  }
  console.log('PASS payment escrow duplicate webhook self-test', {
    workers: body.workers,
    active_hold_count: body.active_hold_count,
    capture_event_count: body.capture_event_count,
    hold_ids: body.hold_ids,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
