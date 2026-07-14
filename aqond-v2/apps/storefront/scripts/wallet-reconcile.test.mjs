#!/usr/bin/env node
/** Merchant wallet reconciliation self-heal test: a released hold whose credit was lost must be
 *  credited exactly once by reconciliation (idempotent on re-run).
 *  Requires a storefront dev server (default :3003). Set STOREFRONT_URL to target another. */
const BASE = process.env.STOREFRONT_URL || 'http://127.0.0.1:3003';

async function main() {
  const res = await fetch(`${BASE}/api/dev/merchant/wallet/reconcile-self-test`, { method: 'POST' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.pass) {
    console.error('FAIL wallet reconcile self-test', JSON.stringify(body, null, 2));
    process.exit(1);
  }
  console.log('PASS wallet reconcile self-test', {
    backend: body.backend,
    net_micro: body.net_micro,
    available_before: body.available_before,
    first_run: body.first_run,
    available_after_first: body.available_after_first,
    second_run: body.second_run,
    available_after_second: body.available_after_second,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
