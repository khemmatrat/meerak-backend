/**
 * Phase 1A payment-core regression runner (Task 18 close-out).
 *
 * Orchestrates existing focused invariant suites only — does not refactor tests
 * or production payment paths. Preserve PAYMENT_CORE_BASELINE_FREEZE.md semantics.
 *
 *   cd backend && node scripts/test_phase1a_regressions.js
 *
 * Exit 1 if any suite fails. No skips, no weakening of child assertions.
 */

import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptsDir = __dirname;
const backendDir = join(__dirname, '..');

/** @type {readonly { id: string; file: string; coverage: string }[]} */
const SUITES = Object.freeze([
  {
    id: 'payment_creation_guard',
    file: 'test_payment_creation_guard.js',
    coverage:
      'Task 17: duplicate reuse, concurrency, rate limit contract, UX/trace on create, ledger/outbound/webhook quiet on reuse, ORDER BY id proofs (delegated assertions inside suite).',
  },
  {
    id: 'phase1a_focused_regression',
    file: 'test_payment_phase1a_regression.js',
    coverage:
      'Task 18 focused: webhook replay/idempotency, invalid signature → hard_failed, amount mismatch rollback, unknown purpose → handler_resolution failure, concurrent same event_id, wallet/job/escrow exactly-once & ordering, retry schedule [30,120,600,1800], reconciliation classifier safety, UX pure contract, ledger append-only/runtime + source proofs.',
  },
  {
    id: 'payment_response_presenter',
    file: 'test_payment_response_presenter.js',
    coverage:
      'Canonical UX: deterministic presenter, terminal poll_after_ms, status_version chain, provider tokens not surfaced as ux.status.',
  },
  {
    id: 'payment_state_projection',
    file: 'test_payment_state_projection.js',
    coverage:
      'Pure projection states, ledger id ordering proofs (ORDER BY id, not created_at), replay determinism.',
  },
  {
    id: 'internal_gateway_reconciliation',
    file: 'test_internal_gateway_reconciliation.js',
    coverage:
      'Reconciliation evidence read-only contract; ledger ORDER BY id DESC in derivation; no DML.',
  },
  {
    id: 'reconciliation_actions',
    file: 'test_reconciliation_actions.js',
    coverage:
      'Pure classifier: amount mismatch → freeze/manual_review; provider unavailable → retry_reconciliation_later; no synthesized ledger.',
  },
  {
    id: 'payment_webhook_worker',
    file: 'test_payment_webhook_worker.js',
    coverage:
      'processWebhookJob: happy path, replay skip, retries/DLQ, finalize* handlers; fixed backoff alignment with paymentRetryPolicy.',
  },
  {
    id: 'payment_business_actions',
    file: 'test_payment_business_actions.js',
    coverage:
      'Registry + wallet_topup / job_checkout / subscription handlers; unknown purpose resolution at registry layer (null); handler contracts.',
  },
  {
    id: 'intent_read_cutover_flags',
    file: 'test_payment_intent_cutover.js',
    coverage:
      'Task 22: intent cutover env + phase metrics on controlled reads; projection path reuse 19D; default off / rollback via env.',
  },
]);

console.log(`
================================================================================
 Phase 1A payment-core regression runner
================================================================================
`);

console.log('\n[Coverage proof — suites → invariant themes]\n');
for (const s of SUITES) {
  console.log(`  • ${s.id}`);
  console.log(`    → ${s.coverage}\n`);
}

console.log('\n[Execute] Running suites in fixed order…\n');

let failures = [];

for (const s of SUITES) {
  const scriptPath = join(scriptsDir, s.file);
  console.log(`
--------------------------------------------------------------------------------
 SUITE: ${s.id}
 script: ${s.file}
--------------------------------------------------------------------------------
`);

  const r = spawnSync(process.execPath, [scriptPath], {
    cwd: backendDir,
    stdio: 'inherit',
    env: process.env,
  });

  const code = r.status ?? (r.signal ? 1 : 1);
  if (code !== 0) {
    failures.push({ id: s.id, code, signal: r.signal });
    console.error(`\n❌ FAILED: ${s.id} (exit ${code}${r.signal ? ` signal ${r.signal}` : ''})\n`);
  } else {
    console.log(`\n✔ OK: ${s.id}\n`);
  }
}

console.log(`
================================================================================
 Summary: ${SUITES.length - failures.length} / ${SUITES.length} suites passed
================================================================================
`);

if (failures.length) {
  for (const f of failures) {
    console.error(`  failed: ${f.id} (${f.code})`);
  }
  console.error('\nPhase 1A regressions: FREEZE GATE FAILED.\n');
  process.exit(1);
}

console.log('Phase 1A regressions: all suites passed — baseline freeze gate satisfied.\n');
console.log(
  '(PAYMENT_CORE_BASELINE_FREEZE.md unchanged by this runner; webhook/retry/recon/projection/outbound/settlement/ledger presenters not refactored here.)\n',
);
process.exit(0);
