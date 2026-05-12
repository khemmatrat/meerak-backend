/**
 * Task 22 — Intent read cutover flags + drift metrics tagging (pure; no DB required).
 *
 *   cd backend && node scripts/test_payment_intent_cutover.js
 */

import {
  getCanonicalAuditAdminResponse,
  ingestControlledReadDecision,
  resetCanonicalAuditMetricsForTests,
} from '../lib/paymentCanonicalMetrics.js';
import {
  getControlledReadProgram,
  getIntentCutoverPhaseLabel,
  intentCutoverPhaseMetricSlug,
  isCanonicalFirstProjectionReadsEnabled,
  isIntentCutoverReadsEnabled,
  isPaymentCanonicalReadsEnabled,
} from '../lib/paymentIntentCutover.js';

function ok(label, cond, detail = '') {
  if (!cond) {
    console.error(`FAIL: ${label}`, detail || '');
    process.exit(1);
  }
  console.log(`OK: ${label}`);
}

const savedCanon = process.env.PAYMENT_CANONICAL_READS;
const savedIntent = process.env.PAYMENT_INTENT_CUTOVER_READS;
const savedPhase = process.env.PAYMENT_INTENT_CUTOVER_PHASE;

function restoreEnv() {
  if (savedCanon === undefined) delete process.env.PAYMENT_CANONICAL_READS;
  else process.env.PAYMENT_CANONICAL_READS = savedCanon;
  if (savedIntent === undefined) delete process.env.PAYMENT_INTENT_CUTOVER_READS;
  else process.env.PAYMENT_INTENT_CUTOVER_READS = savedIntent;
  if (savedPhase === undefined) delete process.env.PAYMENT_INTENT_CUTOVER_PHASE;
  else process.env.PAYMENT_INTENT_CUTOVER_PHASE = savedPhase;
}

console.log('\n=== Task 22 intent cutover (env + metrics) ===\n');

process.env.PAYMENT_CANONICAL_READS = '0';
process.env.PAYMENT_INTENT_CUTOVER_READS = '0';
delete process.env.PAYMENT_INTENT_CUTOVER_PHASE;
ok('default: intent cutover off', !isIntentCutoverReadsEnabled());
ok('default: canonical reads off', !isPaymentCanonicalReadsEnabled());
ok('default: canonical-first projection off', !isCanonicalFirstProjectionReadsEnabled());
ok('default: read program off', getControlledReadProgram() === 'off');
ok('default: cutover phase null', getIntentCutoverPhaseLabel() === null);

process.env.PAYMENT_INTENT_CUTOVER_READS = '1';
process.env.PAYMENT_INTENT_CUTOVER_PHASE = 'Phase-Projection';
ok('cutover on', isIntentCutoverReadsEnabled());
ok('canonical-first projection on (via cutover)', isCanonicalFirstProjectionReadsEnabled());
ok('read program intent_cutover', getControlledReadProgram() === 'intent_cutover');
ok('phase label normalized', getIntentCutoverPhaseLabel() === 'phase-projection');

ok('phase metric slug', intentCutoverPhaseMetricSlug('Phase Projection!') === 'phase_projection');

resetCanonicalAuditMetricsForTests();
ingestControlledReadDecision({
  gateway_transaction_id: 'gw-task22',
  payment_id: 'pay-task22',
  lane: 'canonical',
  completeness: { ok: true },
  shadow_classification: 'match',
  read_program: 'intent_cutover',
  cutover_phase: 'phase-projection',
  created_at_ms: 4242,
});
let r = getCanonicalAuditAdminResponse();
ok('metrics: intent cutover decision total === 1', r.stats.intent_cutover_read_decisions_total === 1);
ok('metrics: canonical lane success', r.stats.intent_cutover_canonical_lane_success === 1);
ok('metrics: phase bucket', r.intent_cutover_phase_counters?.phase_projection === 1);
const last = r.recent[0];
ok('recent: read_program', last?.read_program === 'intent_cutover');
ok('recent: cutover_phase', last?.cutover_phase === 'phase-projection');

resetCanonicalAuditMetricsForTests();
ingestControlledReadDecision({
  gateway_transaction_id: 'gw-fb',
  payment_id: 'pay-fb',
  lane: 'gateway',
  completeness: { ok: false, reason: 'missing_payment' },
  shadow_classification: 'match',
  read_program: 'intent_cutover',
  cutover_phase: 'full',
  created_at_ms: 9999,
});
r = getCanonicalAuditAdminResponse();
ok('fallback lane bumps intent counter', r.stats.intent_cutover_gateway_lane_fallback === 1);
ok('phase full slug', r.intent_cutover_phase_counters?.full === 1);

process.env.PAYMENT_INTENT_CUTOVER_READS = '0';
process.env.PAYMENT_CANONICAL_READS = '1';
ok('legacy canonical reads program', getControlledReadProgram() === 'canonical_reads');

restoreEnv();
console.log('\nPASS: test_payment_intent_cutover.js\n');
