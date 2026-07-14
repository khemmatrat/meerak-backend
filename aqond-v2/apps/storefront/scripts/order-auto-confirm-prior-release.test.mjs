#!/usr/bin/env node
/** ORDER-AUTO-CONFIRM: prior escrow release (return rejected) must not double-release on job rescan. */
const BASE = process.env.STOREFRONT_URL || 'http://127.0.0.1:3003';

async function main() {
  const res = await fetch(`${BASE}/api/dev/orders/v1/auto-confirm/prior-release-self-test`, {
    method: 'POST',
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.pass) {
    console.error('FAIL order auto-confirm prior-release self-test', body);
    process.exit(1);
  }
  console.log('PASS order auto-confirm prior-release self-test', {
    scenario: body.scenario,
    order_id: body.order_id,
    direct_skip_reason: body.direct_skip_reason,
    job_rescan_skip_reason: body.job_rescan_skip_reason,
    release_audit_count: body.release_audit_count,
    escrow_status: body.escrow_status,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
