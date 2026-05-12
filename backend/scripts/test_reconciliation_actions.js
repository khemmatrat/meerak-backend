/**
 * Task 13: Reconciliation action lines — pure classifier + merge coverage.
 *
 * Usage (from repo root or backend):
 *   node backend/scripts/test_reconciliation_actions.js
 */
import {
  AMOUNT_TOLERANCE_MINOR,
  classifyPaymentCoreReconciliation,
  mergeDuplicateProviderEvents,
  RECONCILIATION_NEXT_ACTION,
  RECONCILIATION_STATUS,
} from '../lib/paymentReconciliationActions.js';

let pass = 0;
let fail = 0;

function ok(name) {
  pass += 1;
  console.log(`  ✓ ${name}`);
}
function notOk(name, detail) {
  fail += 1;
  console.error(`  ✗ ${name} :: ${detail}`);
}

function assert(cond, name, detail = '') {
  if (cond) ok(name);
  else notOk(name, detail);
}

function assertEq(a, b, name) {
  assert(a === b, name, `expected ${b}, got ${a}`);
}

/** @param {object} ev */
function basePaid(ev) {
  return {
    provider_available: true,
    provider_data_complete: true,
    provider_paid_or_captured: true,
    provider_status: 'paid',
    provider_amount_minor: 10000,
    duplicate_provider_events: false,
    gateway_row_present: true,
    gateway_status: 'CAPTURED',
    gateway_amount_minor: 10000,
    internal_finalized: true,
    webhook_processing_evidence: true,
    ledger_event_types_ordered_by_id_desc: ['PAYMENT_COMPLETED', 'ESCROW_HOLD'],
    ledger_amount_minor: 10000,
    expects_escrow_hold: true,
    provider_reversed: false,
    ...ev,
  };
}

function testPerfectMatch() {
  const r = classifyPaymentCoreReconciliation(basePaid({}));
  assertEq(r.status, RECONCILIATION_STATUS.MATCHED, 'match: status');
  assertEq(r.next_action, RECONCILIATION_NEXT_ACTION.NONE, 'match: next_action');
  assert(r.requires_manual_review === false, 'match: no manual review');
}

function testMissingWebhook() {
  const r = classifyPaymentCoreReconciliation(
    basePaid({
      internal_finalized: false,
      webhook_processing_evidence: false,
    }),
  );
  assertEq(r.status, RECONCILIATION_STATUS.MISSING_WEBHOOK, 'missing webhook: status');
  assertEq(r.next_action, RECONCILIATION_NEXT_ACTION.MANUAL_REPLAY_WEBHOOK, 'missing webhook: action');
}

function testStaleInternalStatus() {
  const r = classifyPaymentCoreReconciliation(
    basePaid({
      gateway_status: 'PENDING',
      internal_finalized: false,
      ledger_event_types_ordered_by_id_desc: ['PAYMENT_COMPLETED'],
      webhook_processing_evidence: true,
    }),
  );
  assertEq(r.status, RECONCILIATION_STATUS.STATUS_MISMATCH, 'stale gateway: status');
  assertEq(r.next_action, RECONCILIATION_NEXT_ACTION.MANUAL_REVIEW, 'stale gateway: action');
}

function testProviderUnavailable() {
  const r = classifyPaymentCoreReconciliation(
    basePaid({
      provider_available: false,
      provider_data_complete: false,
    }),
  );
  assertEq(r.status, RECONCILIATION_STATUS.PROVIDER_UNAVAILABLE, 'provider down: status');
  assertEq(r.next_action, RECONCILIATION_NEXT_ACTION.RETRY_RECONCILIATION_LATER, 'provider down: action');
}

function testAmountMismatch() {
  const r = classifyPaymentCoreReconciliation(
    basePaid({
      gateway_amount_minor: 10000,
      ledger_amount_minor: 10000 + AMOUNT_TOLERANCE_MINOR + 50,
      provider_amount_minor: 10000,
    }),
  );
  assertEq(r.status, RECONCILIATION_STATUS.AMOUNT_MISMATCH, 'amount: status');
  assertEq(r.next_action, RECONCILIATION_NEXT_ACTION.FREEZE_AND_MANUAL_REVIEW, 'amount: action');
}

function testMissingInternalPayment() {
  const r = classifyPaymentCoreReconciliation(
    basePaid({
      gateway_row_present: false,
      gateway_status: null,
      gateway_amount_minor: null,
      internal_finalized: false,
      webhook_processing_evidence: false,
    }),
  );
  assertEq(r.status, RECONCILIATION_STATUS.MISSING_INTERNAL_PAYMENT, 'no internal row: status');
  assertEq(r.next_action, RECONCILIATION_NEXT_ACTION.MANUAL_REVIEW_HIGH_PRIORITY, 'no internal row: action');
}

function testDuplicateProviderConvergence() {
  const dupRows = [
    { provider_event_id: 'evt_b', payment_id: 'pay_1' },
    { provider_event_id: 'evt_a', payment_id: 'pay_1' },
    { provider_event_id: 'evt_a', payment_id: 'pay_1' },
  ];
  const m = mergeDuplicateProviderEvents(dupRows);
  assert(m.primary_provider_event_id === 'evt_a', 'duplicate: deterministic primary evt_a');

  const r = classifyPaymentCoreReconciliation(
    basePaid({
      duplicate_provider_events: true,
    }),
  );
  assert(
    String(r.reconciliation_reason || '').includes('duplicate_provider_events_converged'),
    'duplicate: reason tag',
    r.reconciliation_reason,
  );
}

/**
 * Ledger-derived fields must follow id DESC semantics in production SQL;
 * classifier uses list membership + first PAYMENT_COMPLETED amount from builder —
 * swapping non-terminal event order must not flip PAYMENT_COMPLETED / ESCROW flags.
 */
function testLedgerOrderNeutralForMembership() {
  const A = classifyPaymentCoreReconciliation(
    basePaid({
      ledger_event_types_ordered_by_id_desc: ['ESCROW_HOLD', 'PAYMENT_COMPLETED'],
      ledger_amount_minor: 9900,
    }),
  );
  const B = classifyPaymentCoreReconciliation(
    basePaid({
      ledger_event_types_ordered_by_id_desc: ['PAYMENT_COMPLETED', 'ESCROW_HOLD'],
      ledger_amount_minor: 9900,
    }),
  );
  assertEq(A.status, B.status, 'ledger permutation: same status classification');
  assertEq(A.status, RECONCILIATION_STATUS.AMOUNT_MISMATCH, 'ledger permutation: expect amount mismatch');

  assert(
    classifyPaymentCoreReconciliation(basePaid({})).reconciliation_reason ===
      classifyPaymentCoreReconciliation(basePaid({})).reconciliation_reason,
    'idempotent: identical reason strings',
    '',
  );
}

async function main() {
  console.log('\n[task13] reconciliation action lines\n');

  console.log('[1] perfect match');
  testPerfectMatch();

  console.log('\n[2] missing webhook');
  testMissingWebhook();

  console.log('\n[3] stale internal (ledger completed, gateway pending)');
  testStaleInternalStatus();

  console.log('\n[4] provider unavailable / incomplete snapshot');
  testProviderUnavailable();

  console.log('\n[5] amount mismatch');
  testAmountMismatch();

  console.log('\n[6] provider paid — no gateway row');
  testMissingInternalPayment();

  console.log('\n[7] duplicate provider events');
  testDuplicateProviderConvergence();

  console.log('\n[8] deterministic classification & ledger permutation');
  testLedgerOrderNeutralForMembership();

  console.log('');
  if (fail) {
    console.error(`task13 FAILED  (${pass} ok, ${fail} failed)`);
    process.exitCode = 1;
  } else {
    console.log(`task13 OK  (${pass} checks)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
