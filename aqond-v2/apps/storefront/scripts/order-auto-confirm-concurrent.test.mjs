#!/usr/bin/env node
/** ORDER-AUTO-CONFIRM concurrent release integrity (requires storefront on :3003). */
const BASE = process.env.STOREFRONT_URL || 'http://127.0.0.1:3003';

async function main() {
  const res = await fetch(`${BASE}/api/dev/orders/v1/auto-confirm/self-test`, { method: 'POST' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.pass) {
    console.error('FAIL order auto-confirm concurrent self-test', body);
    process.exit(1);
  }
  console.log('PASS order auto-confirm concurrent self-test', {
    workers: body.workers,
    release_audit_count: body.release_audit_count,
    released_count: body.released_count,
    duplicate_count: body.duplicate_count,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
