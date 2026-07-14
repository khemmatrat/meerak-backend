#!/usr/bin/env node
/** Run Return Core Phase 2 jobs (auto-confirm + reconciliation) against DB-backed escrow. */
const BASE = process.env.STOREFRONT_URL || 'http://127.0.0.1:3003';

async function main() {
  const res = await fetch(`${BASE}/api/return/v1/jobs/run`, { method: 'POST' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('FAIL return escrow jobs', body);
    process.exit(1);
  }
  console.log('PASS return escrow jobs', JSON.stringify(body, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
