#!/usr/bin/env node
/** Platform commission accrue/release/refund (requires storefront on :3003). */
const BASE = process.env.STOREFRONT_URL || 'http://127.0.0.1:3003';

async function main() {
  const res = await fetch(`${BASE}/api/dev/platform-commission/self-test`, { method: 'POST' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.pass) {
    console.error('FAIL platform commission self-test', body);
    process.exit(1);
  }
  console.log('PASS platform commission self-test', {
    backend: body.backend,
    commission_rate: body.commission_rate,
    concurrent: body.concurrent?.pass,
    release: body.release?.pass,
    refund: body.refund?.pass,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
