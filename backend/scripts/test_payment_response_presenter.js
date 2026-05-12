/**
 * Task 16: canonical UX payment presenter verification.
 *
 *   cd backend && node scripts/test_payment_response_presenter.js
 *
 * Covers A–J: deterministic mapping, terminal poll stop, expired > pending,
 * failed/manual_review hints, stale version guard, provider normalization,
 * sparse payload merge, replay identity, no created_at coupling.
 */
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { PROJECTION_STATES } from '../lib/paymentStateProjection.js';
import {
  UX_PAYMENT_STATUS,
  UX_STATUS_VERSION,
  UX_TERMINAL_STATUSES,
  POLL_MS_NON_TERMINAL,
  shouldDiscardStaleUx,
  presentUxPaymentFromProjection,
  presentUxStripeIntentCreate,
  presentUxImmediateCompleted,
  normalizeUxPaymentPayload,
  classifyGatewayStatus,
} from '../lib/paymentResponsePresenter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let pass = 0;
let fail = 0;

function ok(n) {
  pass += 1;
  console.log(`  ✓ ${n}`);
}
function notOk(n, d) {
  fail += 1;
  console.error(`  ✗ ${n} :: ${d}`);
}
function assert(c, n, d = '') {
  if (c) ok(n);
  else notOk(n, d);
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

const baseProj = (over = {}) => ({
  payment_id: 'job_abc',
  projection_state: PROJECTION_STATES.PAYMENT_PENDING,
  reason_codes: [],
  gateway_status: null,
  ...over,
});

const fixedNow = 1_700_000_000_000;
const pastExp = new Date(fixedNow - 60_000).toISOString();

// —— A. deterministic mapping + I. replay-safe identical response
{
  const p = baseProj({ gateway_status: 'REQUIRES_ACTION' });
  const o = { trace_id: 't1', display_amount: '199', now_ms: fixedNow, awaiting_user_hint: true };
  const a = presentUxPaymentFromProjection(p, o);
  const b = presentUxPaymentFromProjection(p, o);
  assert(deepEqual(a, b), 'A/I: same evidence → identical UX payload');
}

// —— B. terminal polling stop
{
  for (const s of UX_TERMINAL_STATUSES) {
    const partial = normalizeUxPaymentPayload({ status: s, payment_id: 'x' });
    assert(partial.poll_after_ms === 0, `B: terminal ${s} → poll_after_ms=0`);
  }
  const nonTerm = ['pending', 'awaiting_payment', 'processing'];
  for (const s of nonTerm) {
    const partial = normalizeUxPaymentPayload({ status: s, payment_id: 'x' });
    assert(partial.poll_after_ms === POLL_MS_NON_TERMINAL, `B: non-terminal ${s} → fixed poll`);
  }
}

// —— C. expired overrides provider pending
{
  const p = baseProj({ gateway_status: 'PAY_PENDING', projection_state: PROJECTION_STATES.PAYMENT_PENDING });
  const ux = presentUxPaymentFromProjection(p, {
    now_ms: fixedNow,
    expires_at: pastExp,
    display_amount: '100',
    trace_id: 't_exp',
  });
  assert(ux.status === UX_PAYMENT_STATUS.expired, 'C: clock-expired pending → expired', ux.status);
  assert(ux.poll_after_ms === 0, 'C: expired is terminal poll', String(ux.poll_after_ms));
}

// —— C. expired_override
{
  const ux = presentUxPaymentFromProjection(baseProj({ gateway_status: 'AUTHORIZED' }), {
    expired_override: true,
    display_amount: '50',
    trace_id: 't',
    now_ms: fixedNow,
  });
  assert(ux.status === UX_PAYMENT_STATUS.expired, 'C: expired_override forces expired');
}

// —— D. failed localization
{
  const p = baseProj({
    projection_state: PROJECTION_STATES.PAYMENT_FAILED,
    gateway_status: 'FAILED',
    reason_codes: ['gateway_failure_with_PAYMENT_COMPLETED_ledger'],
  });
  const ux = presentUxPaymentFromProjection(p, { display_amount: '10', trace_id: 't' });
  assert(ux.status === UX_PAYMENT_STATUS.failed, 'D: failed status');
  assert(ux.failure_code === 'gateway_failed', 'D: gateway FAILED → failure_code', String(ux.failure_code));
  assert(
    typeof ux.failure_hint_th === 'string' && ux.failure_hint_th.length > 0,
    'D: failure_hint_th set',
  );
  assert(
    typeof ux.failure_hint_en === 'string' && ux.failure_hint_en.length > 0,
    'D: failure_hint_en set',
  );
}

// —— E. manual_review localization (generic safe)
{
  const p = baseProj({
    projection_state: PROJECTION_STATES.PAYMENT_REQUIRES_MANUAL_REVIEW,
    reason_codes: ['fraud_risk_internal_do_not_expose'],
  });
  const ux = presentUxPaymentFromProjection(p, { display_amount: '10', trace_id: 't' });
  assert(ux.status === UX_PAYMENT_STATUS.manual_review, 'E: manual_review status');
  const hint = `${ux.failure_hint_en || ''}${ux.failure_hint_th || ''}`.toLowerCase();
  assert(!hint.includes('fraud'), 'E: no raw risk token in hints');
  assert(
    typeof ux.failure_hint_en === 'string' && ux.failure_hint_en.length > 0,
    'E: failure_hint_en for manual_review',
  );
}

// —— F. stale lower-version ignored (client contract)
{
  assert(shouldDiscardStaleUx(6, 4) === true, 'F: discard when incoming < stored');
  assert(shouldDiscardStaleUx(4, 4) === false, 'F: same version kept');
  assert(shouldDiscardStaleUx(4, 6) === false, 'F: newer kept');
}

// —— G. provider status normalization (never in UX status string)
{
  const forbiddenInStatus = ['CAPTURED', 'AUTHORIZED', 'ESCROW_HELD', 'PAYSO_PENDING', 'STRIPE_REQUIRES_ACTION'];
  const canonical = new Set(Object.values(UX_PAYMENT_STATUS));
  const p = baseProj({ projection_state: PROJECTION_STATES.PAYMENT_PENDING });
  for (const gw of forbiddenInStatus) {
    const ux = presentUxPaymentFromProjection(
      { ...p, gateway_status: gw },
      { display_amount: '1', trace_id: 't', now_ms: fixedNow },
    );
    assert(canonical.has(ux.status), `G: UX status is canonical (${gw})`, ux.status);
    assert(!forbiddenInStatus.includes(ux.status), `G: raw provider token not leaked as status (${gw})`);
  }
  const ns = presentUxPaymentFromProjection(
    baseProj({ gateway_status: 'STRIPE_REQUIRES_ACTION' }),
    { display_amount: '1', trace_id: 't', now_ms: fixedNow },
  );
  assert(ns.status === UX_PAYMENT_STATUS.awaiting_payment, 'G: Stripe requires-action → awaiting_payment');
}

// —— normalize strips unknown statuses
{
  const n = normalizeUxPaymentPayload({
    payment_id: 'x',
    status: 'CAPTURED',
    next_action: 'STRIPE_SCA_REDIRECT',
  });
  assert(n.status === UX_PAYMENT_STATUS.pending, 'G/H: unknown status → pending bucket');
  assert(n.next_action === 'wait' || n.next_action === 'none', 'G/H: unknown next_action sanitized');
}

// —— H. missing-field normalization
{
  const sparse = normalizeUxPaymentPayload({
    payment_id: 'p1',
    status: 'completed',
    // omit next_action, poll, hints, trace, version
  });
  assert(sparse.payment_id === 'p1', 'H: payment_id preserved');
  assert(sparse.status === UX_PAYMENT_STATUS.completed, 'H: status');
  assert(sparse.poll_after_ms === 0, 'H: terminal poll');
  assert(typeof sparse.trace_id === 'string' && sparse.trace_id.length > 0, 'H: trace_id default');
  assert(sparse.status_version >= UX_STATUS_VERSION.completed, 'H: version floored to enum');
}

// —— status_version monotonic ordering (suggested scale)
{
  const order = [
    UX_STATUS_VERSION.pending,
    UX_STATUS_VERSION.awaiting_payment,
    UX_STATUS_VERSION.processing,
    UX_STATUS_VERSION.completed,
    UX_STATUS_VERSION.reversed,
    UX_STATUS_VERSION.manual_review,
  ];
  let prev = 0;
  for (const v of order) {
    assert(v >= prev, 'version: suggested non-decreasing chain', `${v} vs ${prev}`);
    prev = v;
  }
  assert(UX_STATUS_VERSION.failed === UX_STATUS_VERSION.completed, 'failed shares completed tier per spec');
}

// —— Stripe create + wallet completed shapes
{
  const st = presentUxStripeIntentCreate({ paymentIntentId: 'pi_x', display_amount: '420', trace_id: 'stripe:t' });
  assert(st.status === UX_PAYMENT_STATUS.awaiting_payment, 'Stripe create → awaiting_payment');
  assert(st.status_version === UX_STATUS_VERSION.awaiting_payment, 'Stripe version');
  const w = presentUxImmediateCompleted('job1', '99', 'w:t');
  assert(w.status === UX_PAYMENT_STATUS.completed && w.poll_after_ms === 0, 'wallet OK shape');
}

// —— J. presenter logic does not reference created_at ordering
{
  const src = fs.readFileSync(join(__dirname, '../lib/paymentResponsePresenter.js'), 'utf8');
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*/gm, '');
  assert(!/\bcreated_at\b/i.test(stripped), 'J: no created_at in presenter logic');
}

// —— classifyGatewayStatus sanity
{
  const c1 = classifyGatewayStatus('REQUIRES_ACTION');
  assert(c1.awaitsUser === true && c1.processingLike === false, 'classify REQUIRES_ACTION');
  const c2 = classifyGatewayStatus('PROCESSING');
  assert(c2.processingLike === true, 'classify PROCESSING');
}

console.log(`\nPayment response presenter: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
