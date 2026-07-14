#!/usr/bin/env node
/** Merchant wallet concurrent-credit integrity test (no lost update + idempotency).
 *  Requires a storefront dev server (default :3003). Set STOREFRONT_URL to target another. */
const BASE = process.env.STOREFRONT_URL || 'http://127.0.0.1:3003';
const WORKERS = Number(process.env.WALLET_TEST_WORKERS || 24);

async function main() {
  const res = await fetch(`${BASE}/api/dev/merchant/wallet/concurrent-self-test`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ workers: WORKERS }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.pass) {
    console.error('FAIL wallet concurrent-credit self-test', JSON.stringify(body, null, 2));
    process.exit(1);
  }
  console.log('PASS wallet concurrent-credit self-test', {
    backend: body.backend,
    workers: body.workers,
    phase1_distinct: body.phase1_distinct,
    phase2_idempotent: body.phase2_idempotent,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
