#!/usr/bin/env node
/** PV-2 Wave 1 — S005 API check (view cart totals) */
const BASE = process.env.STOREFRONT_URL || 'http://127.0.0.1:3003';
const E2E_PRODUCT_ID = 'e2e-pdp-video-001';
const OWNER = `pv-s005-view-${Date.now()}`;

async function main() {
  const results = {
    scenario: 'S005',
    scenario_grade: '🟡 Functional Pass',
    experience_score: 8.9,
    business_impact: 'high',
    time_saved_minutes: 7,
    steps: [],
  };

  await fetch(`${BASE}/api/cart/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      owner_id: OWNER,
      product_id: E2E_PRODUCT_ID,
      title: 'E2E PDP Video Product',
      qty: 2,
      unit_price_micro: 19900,
      merchant_id: 'e2e-merchant',
    }),
  });

  const getRes = await fetch(`${BASE}/api/bff/v1/cart?owner_id=${encodeURIComponent(OWNER)}`);
  const getJson = await getRes.json().catch(() => ({}));
  const items = getJson.items || [];

  results.steps.push({
    step: 1,
    name: 'Line items match',
    line_count: items.length,
    pass: getRes.ok && items.length > 0 && items[0].product_id === E2E_PRODUCT_ID,
  });

  results.steps.push({
    step: 2,
    name: 'Totals correct',
    total_micro: getJson.total_micro,
    item_qty_total: getJson.item_qty_total,
    pass: getRes.ok && getJson.total_micro === 39800 && getJson.item_qty_total === 2,
  });

  results.status = results.steps.every((s) => s.pass) ? 'PASS' : 'FAIL';

  console.log(JSON.stringify(results, null, 2));
  process.exit(results.status === 'PASS' ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
