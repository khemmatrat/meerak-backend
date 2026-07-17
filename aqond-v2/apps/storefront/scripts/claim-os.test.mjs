#!/usr/bin/env node
/**
 * Sprint S9-S12 — Claim OS (storefront :3003)
 */
const BASE = process.env.STOREFRONT_URL || 'http://127.0.0.1:3003';

async function json(url, init) {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const orderId = `claim-test-${Date.now()}`;
  const open = await json(`${BASE}/api/disputes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      order_id: orderId,
      merchant_id: 'food-thai-1',
      customer_id: 'claim-tester',
      order_type: 'food',
      category: 'missing_items',
      title: 'ได้ไม่ครบ',
      description: 'ขาด 1 รายการ',
      order_total_micro: 5000000,
      items: [{ product_id: 'd1', title: 'ข้าวผัด', qty: 1, unit_price_micro: 5000000, received: false }],
    }),
  });
  assert(open.res.ok && open.data.case?.id, `open claim: ${JSON.stringify(open.data)}`);
  const caseId = open.data.case.id;

  const photoRequired = await json(`${BASE}/api/disputes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      order_id: orderId + '-photo',
      merchant_id: 'food-thai-1',
      customer_id: 'claim-tester',
      order_type: 'food',
      category: 'damaged_food',
      title: 'อาหารเสียหาย',
      description: 'หกเละ',
      order_total_micro: 3000000,
      items: [],
    }),
  });
  assert(photoRequired.res.status === 400, 'photo required for damaged_food');

  const settle = await json(`${BASE}/api/disputes/${encodeURIComponent(caseId)}/settle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ partial: true, refund_micro: 2500000, actor: 'admin-test' }),
  });
  assert(settle.res.ok && settle.data.case?.status === 'resolved_refund', `settle: ${JSON.stringify(settle.data)}`);

  const replace = await json(`${BASE}/api/disputes/${encodeURIComponent(caseId)}/replace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actor: 'admin-test' }),
  });
  assert(replace.res.ok && replace.data.case?.replacement_order_id, 'replace order');

  const redispatch = await json(`${BASE}/api/disputes/${encodeURIComponent(caseId)}/redispatch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actor: 'admin-test' }),
  });
  assert(redispatch.res.ok && redispatch.data.case?.redispatch_job_id, 'redispatch');

  const close = await json(`${BASE}/api/disputes/${encodeURIComponent(caseId)}/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note: 'test close' }),
  });
  assert(close.res.ok && close.data.case?.status === 'closed', 'close case');

  console.log('claim-os.test.mjs OK', caseId);
}

main().catch((e) => {
  console.error('claim-os FAILED:', e.message);
  process.exit(1);
});
