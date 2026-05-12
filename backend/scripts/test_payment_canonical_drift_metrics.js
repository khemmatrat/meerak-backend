/**
 * Task 19E — Canonical drift metrics + admin audit (read-only ingestion).
 *
 *   cd backend && node scripts/test_payment_canonical_drift_metrics.js
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import {
  deriveControlledReadFallbackReasonCodes,
  getCanonicalAuditAdminResponse,
  getCanonicalAuditRingSize,
  ingestCanonicalShadowAudit,
  ingestControlledReadDecision,
  resetCanonicalAuditMetricsForTests,
} from '../lib/paymentCanonicalMetrics.js';
import { projectPaymentState } from '../lib/paymentStateProjection.js';
import { presentUxPaymentFromProjection } from '../lib/paymentResponsePresenter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendDir = join(__dirname, '..');

function ok(label, cond, detail = '') {
  if (!cond) {
    console.error(`FAIL: ${label}`, detail || '');
    process.exit(1);
  }
  console.log(`OK: ${label}`);
}

console.log('=== Task 19E drift metrics tests ===');

/* A — deterministic increments */
resetCanonicalAuditMetricsForTests();
for (let i = 0; i < 3; i++) {
  ingestCanonicalShadowAudit({
    source: 'shadow_projection',
    gateway_transaction_id: `gw-${i}`,
    payment_id: `pay-${i}`,
    classification: 'status_mismatch',
    reason_codes: ['gateway_failure_with_PAYMENT_COMPLETED_ledger'],
    fallback_used: true,
    created_at_ms: 100 + i,
  });
}
let r = getCanonicalAuditAdminResponse();
ok('A deterministic shadow status bumps', r.stats.canonical_shadow_status_mismatch === 3);
ok('A total_audits bookkeeping', r.stats.total_audits === 3);

/* B — fallback reason taxonomy */
resetCanonicalAuditMetricsForTests();
const rcDup = deriveControlledReadFallbackReasonCodes({ ok: false, reason: 'duplicate_attempt_anchor' }, 'match');
ok('B duplicate_anchor', JSON.stringify(rcDup) === JSON.stringify(['duplicate_anchor']));
const rcMis = deriveControlledReadFallbackReasonCodes({ ok: true, reason: null }, 'amount_mismatch');
ok('B amount_mismatch', JSON.stringify(rcMis) === JSON.stringify(['amount_mismatch']));
ingestControlledReadDecision({
  gateway_transaction_id: 'g-x',
  payment_id: 'p-x',
  lane: 'gateway',
  completeness: { ok: false, reason: 'transition_gap' },
  shadow_classification: null,
  created_at_ms: 999,
});
r = getCanonicalAuditAdminResponse();
ok('B ingested fallback has transition_gap', r.recent[0]?.reason_codes?.includes('transition_gap'));

/* C — bounded ring */
resetCanonicalAuditMetricsForTests();
for (let i = 0; i < 350; i++) {
  ingestCanonicalShadowAudit({
    gateway_transaction_id: `g${i}`,
    payment_id: `p`,
    classification: i % 3 === 0 ? 'amount_mismatch' : 'match',
    reason_codes: [],
    created_at_ms: i,
  });
}
r = getCanonicalAuditAdminResponse();
ok('C recent slice cap', r.recent.length <= 80);
ok('C internal ring capped at MAX_RECENT', getCanonicalAuditRingSize() <= 200);

/* D — no DML keywords in ingest paths */
for (const p of ['lib/paymentCanonicalMetrics.js', 'lib/paymentCanonicalShadow.js']) {
  const s = readFileSync(join(backendDir, p), 'utf8').toUpperCase();
  ok(`D ${p} no INSERT INTO`, !s.includes('INSERT INTO'));
  ok(`D ${p} no DELETE FROM`, !s.includes('DELETE FROM'));
}
{
  const s = readFileSync(join(backendDir, 'lib/paymentStateProjection.js'), 'utf8');
  const body = extractFromDbBody(s);
  ok('D projection FromDb snippet no INSERT', !body.includes('INSERT INTO'));
  ok('D projection FromDb snippet no DELETE', !body.includes('DELETE FROM'));
}

/* E + F projection / presenter unchanged */
resetCanonicalAuditMetricsForTests();
const projEv = {
  payment_id: 'job-metrics-1',
  ledger_rows: [],
  escrow_events: [],
  gateway_row: { status: 'PENDING', amount_minor: null, settlement_status: null },
  processed_webhook_keys: [],
};
const pj1 = JSON.stringify(projectPaymentState(projEv));
for (let i = 0; i < 5; i++) {
  ingestControlledReadDecision({
    gateway_transaction_id: `gw-${i}`,
    payment_id: 'job-metrics-1',
    lane: i % 2 === 0 ? 'canonical' : 'gateway',
    completeness: { ok: false, reason: 'missing_payment' },
    shadow_classification: 'match',
    created_at_ms: 2000 + i,
  });
}
const pj2 = JSON.stringify(projectPaymentState(projEv));
ok('E projection stable across metric ingest noise', pj1 === pj2);
const pr = JSON.parse(pj2);
const u1 = presentUxPaymentFromProjection(pr, { display_amount: '9' });
ingestControlledReadDecision({
  gateway_transaction_id: `gw-xx`,
  payment_id: pr.payment_id,
  lane: 'gateway',
  completeness: { ok: true, reason: null },
  shadow_classification: 'status_mismatch',
  created_at_ms: 7777,
});
const u2 = presentUxPaymentFromProjection(JSON.parse(JSON.stringify(pr)), { display_amount: '9' });
ok('F presenter stable', JSON.stringify(u1) === JSON.stringify(u2));

/* G concurrent-style burst */
resetCanonicalAuditMetricsForTests();
await Promise.all(
  Array.from({ length: 120 }, (_, i) =>
    Promise.resolve().then(() =>
      ingestCanonicalShadowAudit({
        gateway_transaction_id: `g:${i}`,
        payment_id: 'p:z',
        classification: i % 2 === 0 ? 'orphan_attempt' : 'missing_canonical',
        reason_codes: [`r${i % 7}`],
        created_at_ms: 500 + i,
      }),
    ),
  ),
);
r = getCanonicalAuditAdminResponse();
ok('G totals consistent', r.stats.canonical_shadow_orphan_attempt + r.stats.canonical_shadow_missing_canonical === 120);

/* H — admin route guarded */
const srv = readFileSync(join(backendDir, 'server.js'), 'utf8');
ok(
  'H canonical-audit route uses adminAuthMiddleware',
  srv.includes(`/api/admin/payments/canonical-audit`) &&
    /app\.get\(\s*['"]\/api\/admin\/payments\/canonical-audit['"]\s*,\s*adminAuthMiddleware/.test(srv),
);

/* I — no DB created_at ordering in metrics module */
const mx = readFileSync(join(backendDir, 'lib/paymentCanonicalMetrics.js'), 'utf8');
ok('I metrics no ORDER BY created_at', !/ORDER\s+BY\s+created_at/i.test(mx));

/* J deterministic mapping classification -> counter bucket */
resetCanonicalAuditMetricsForTests();
ingestCanonicalShadowAudit({
  gateway_transaction_id: 'a',
  payment_id: 'b',
  classification: 'duplicate_attempt_anchor',
  reason_codes: [],
  created_at_ms: 55,
});
ingestCanonicalShadowAudit({
  gateway_transaction_id: 'a',
  payment_id: 'b',
  classification: 'duplicate_attempt_anchor',
  reason_codes: [],
  created_at_ms: 56,
});
r = getCanonicalAuditAdminResponse();
ok('J repeated duplicate_anchor maps deterministically', r.stats.canonical_shadow_duplicate_anchor === 2);

resetCanonicalAuditMetricsForTests();
console.log('\nPASS: test_payment_canonical_drift_metrics.js\n');

/** Extract projectPaymentStateFromDb body heuristic for grep scoping */
function extractFromDbBody(s) {
  const upper = s.toUpperCase();
  const key = 'EXPORT ASYNC FUNCTION PROJECTPAYMENTSTATEFROMDB';
  const idx = upper.indexOf(key);
  if (idx < 0) return s.slice(0, 4000).toUpperCase();
  const closeParen = upper.indexOf(')', idx);
  const startBrace = s.indexOf('{', closeParen);
  let depth = 0;
  for (let p = startBrace; p < s.length; p++) {
    const c = s[p];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return s.slice(startBrace, p + 1).toUpperCase();
    }
  }
  return s.slice(0, 4000).toUpperCase();
}
