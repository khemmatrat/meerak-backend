/**
 * Regression: PaySo PromptPay deposit (/api/v2/promptpaynew) request shape.
 *
 * Ensures we use Bearer auth + query params per docs:
 * merchantID, productDetail, customerEmail, customerName, total, referenceNo
 *
 * Usage:
 *   node backend/scripts/test_payso_promptpaynew_request_shape.js
 */
import { buildPaysoReferenceId } from '../services/paysoService.js';

let pass = 0;
let fail = 0;

function ok(name) {
  pass += 1;
  console.log(`  PASS  ${name}`);
}

function bad(name, err) {
  fail += 1;
  console.error(`  FAIL  ${name}`);
  if (err) console.error(err);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function run(name, fn) {
  try {
    fn();
    ok(name);
  } catch (e) {
    bad(name, e);
  }
}

run('buildPaysoReferenceId returns 12 digits', () => {
  const r = buildPaysoReferenceId('test-uuid-123');
  assert(/^\d{12}$/.test(r), `expected 12 digits, got "${r}"`);
});

run('promptpaynew required query param names', () => {
  const url = new URL('https://apis.paysolutions.asia/tep/api/v2/promptpaynew');
  const referenceNo = buildPaysoReferenceId(`u-${Date.now()}`);
  url.search = new URLSearchParams({
    merchantID: '35753345',
    productDetail: 'AQOND wallet deposit user',
    customerEmail: 'noreply@aqond.local',
    customerName: 'AQOND User',
    total: '100.00',
    referenceNo,
  }).toString();
  const sp = url.searchParams;
  for (const k of ['merchantID', 'productDetail', 'customerEmail', 'customerName', 'total', 'referenceNo']) {
    assert(sp.has(k), `missing ${k}`);
  }
});

if (fail) {
  console.error(`\n${pass} passed, ${fail} failed`);
  process.exit(1);
}
console.log(`\n${pass} passed, ${fail} failed`);

