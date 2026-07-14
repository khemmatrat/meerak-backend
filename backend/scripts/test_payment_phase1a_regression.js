/**
 * Task 18 — Phase 1A payment-core focused regression (verification only).
 *
 * Complements (does not replace): test_payment_webhook_worker, test_payment_business_actions,
 * test_payment_state_projection, test_reconciliation_actions, test_internal_gateway_reconciliation,
 * test_payment_response_presenter, test_payment_creation_guard.
 *
 * Usage: cd backend && node scripts/test_payment_phase1a_regression.js
 *
 * No [skip]: requires DB with Phase 1A migrations (users, gateway_transactions,
 * payment_webhook_jobs, ledger_entries, payment_escrow_events, outbound_domain_events optional).
 */
import pg from 'pg';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

import {
  classifyPaymentCoreReconciliation,
  RECONCILIATION_NEXT_ACTION,
  RECONCILIATION_STATUS,
  AMOUNT_TOLERANCE_MINOR,
} from '../lib/paymentReconciliationActions.js';
import {
  computeRetryDelaySeconds,
  RETRY_SCHEDULE_SECONDS,
} from '../lib/paymentRetryPolicy.js';
import {
  processWebhookJob,
  setSignatureVerifier,
  setBusinessActionResolver,
  finalizeDeadLetter,
} from '../lib/paymentWebhookWorker.js';
import { walletTopupHandler } from '../lib/paymentBusinessActions/walletTopupHandler.js';
import { jobCheckoutHandler } from '../lib/paymentBusinessActions/jobCheckoutHandler.js';
import {
  presentUxPaymentFromProjection,
  shouldDiscardStaleUx,
  UX_STATUS_VERSION,
  UX_PAYMENT_STATUS,
} from '../lib/paymentResponsePresenter.js';
import { PROJECTION_STATES } from '../lib/paymentStateProjection.js';
import { executeEscrowReleaseSettlement } from '../lib/paymentSettlementStateMachine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendDir = join(__dirname, '..');
const rootDir = join(backendDir, '..');
dotenv.config({ path: join(backendDir, '.env') });
dotenv.config({ path: join(rootDir, '.env') });

// This suite exercises webhook business/regression flows with no signature verifier registered
// (setSignatureVerifier(null)). Signature verification now fails closed by default, so we must
// explicitly opt in to unverified processing here. Signature-specific fail-closed behavior is
// covered by test_payment_webhook_security.js.
process.env.DANGEROUSLY_ALLOW_UNVERIFIED_WEBHOOK = '1';

const argv = process.argv.slice(2);
const useUrl = argv.includes('--use-url') && process.env.DATABASE_URL;

function buildPoolConfig() {
  const timeoutMs = Math.min(
    Math.max(parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || '30000', 10) || 30000, 5000),
    120000,
  );
  if (!useUrl) {
    return {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_DATABASE || process.env.DB_NAME || 'meera_db',
      user: process.env.DB_USER || 'meera',
      password: process.env.DB_PASSWORD || 'meera123',
      connectionTimeoutMillis: timeoutMs,
      max: 10,
    };
  }
  return {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: process.env.PGSSLMODE !== 'no-verify' },
    connectionTimeoutMillis: timeoutMs,
    max: 10,
  };
}

const pool = new pg.Pool(buildPoolConfig());
const RUN = `p1a_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
const PROVIDER = 'payso';

let fixtureWalletUserId = '';

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

async function insertGatewayTx({ extRef, amountMinor = 10000, status = 'PENDING', metadata = {}, client_reference_id = null }) {
  const merged = {
    ...(fixtureWalletUserId ? { user_id: fixtureWalletUserId } : {}),
    ...metadata,
  };
  const metaJson =
    merged && typeof merged === 'object' && Object.keys(merged).length
      ? JSON.stringify(merged)
      : '{}';
  try {
    const r = await pool.query(
      `INSERT INTO gateway_transactions (
         external_ref, merchant_reference, amount_minor, currency, status, metadata, client_reference_id
       )
       VALUES ($1, $1, $2, 'THB', $3, $4::jsonb, $5)
       RETURNING id, external_ref, client_reference_id, amount_minor`,
      [extRef, amountMinor, status, metaJson, client_reference_id],
    );
    return r.rows[0];
  } catch (e) {
    if (String(e?.code) === '42703') {
      const r2 = await pool.query(
        `INSERT INTO gateway_transactions (
           external_ref, merchant_reference, amount_minor, currency, status, metadata
         )
         VALUES ($1, $1, $2, 'THB', $3, $4::jsonb)
         RETURNING id, external_ref, amount_minor`,
        [extRef, amountMinor, status, metaJson],
      );
      return r2.rows[0];
    }
    throw e;
  }
}

function paysoPayload({ extRef, amountThb = 100, eventId, purpose }) {
  const metadata = {
    meerak_order_id: extRef,
    purpose: purpose != null ? purpose : 'wallet_topup',
  };
  if (fixtureWalletUserId) metadata.user_id = fixtureWalletUserId;

  return {
    id: eventId,
    event_id: eventId,
    event: 'payment.success',
    provider: PROVIDER,
    data: {
      status: 'paid',
      amount: amountThb,
      currency: 'THB',
      merchant_order_id: extRef,
      paid_at: new Date().toISOString(),
      metadata,
    },
  };
}

async function insertWebhookJob({ eventId, payload, suffix = '', status = 'processing', attemptCount = 1 }) {
  const traceId = `${RUN}:${eventId}`;
  const idemKey = `${PROVIDER}:${eventId}${suffix ? `:${suffix}` : ''}`;
  const sha = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const r = await pool.query(
    `INSERT INTO payment_webhook_jobs (
       provider, event_id, event_type, trace_id,
       headers_json, payload_json, payload_sha256, idempotency_key,
       status, retryable, attempt_count, next_attempt_at
     )
     VALUES ($1, $2, 'payment_confirmed', $3, $4::jsonb, $5::jsonb, $6, $7, $8, TRUE, $9, NOW())
     RETURNING *`,
    [
      PROVIDER,
      eventId,
      traceId,
      JSON.stringify({ 'x-payment-gateway': PROVIDER, 'x-trace-id': traceId }),
      JSON.stringify({
        provider: PROVIDER,
        event_id: eventId,
        raw_body: JSON.stringify(payload),
      }),
      sha,
      idemKey,
      status,
      attemptCount,
    ],
  );
  return r.rows[0];
}

async function ledgerCount(whereSql, params) {
  const r = await pool.query(`SELECT COUNT(*)::int AS c FROM ledger_entries ${whereSql}`, params);
  return r.rows?.[0]?.c ?? 0;
}

async function escrowHoldCount(pid) {
  try {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS c FROM payment_escrow_events WHERE payment_id = $1 AND state = 'HOLD'`,
      [pid],
    );
    return r.rows?.[0]?.c ?? 0;
  } catch {
    return 0;
  }
}

async function outboundCount(pid) {
  try {
    const r = await pool.query(`SELECT COUNT(*)::int AS c FROM outbound_domain_events WHERE payment_id = $1`, [pid]);
    return r.rows?.[0]?.c ?? 0;
  } catch {
    return 0;
  }
}


async function cleanup() {
  const likeEvents = `${RUN}%`;
  await pool.query(`DELETE FROM processed_webhook_events WHERE event_id LIKE $1`, [likeEvents]).catch(() => {});
  await pool.query(`DELETE FROM payment_webhook_event_dedupe WHERE event_id LIKE $1`, [likeEvents]).catch(() => {});
  await pool.query(`DELETE FROM payment_webhook_jobs WHERE event_id LIKE $1`, [likeEvents]).catch(() => {});
  await pool.query(`DELETE FROM outbound_domain_events WHERE payment_id LIKE $1`, [`${RUN}%`]).catch(() => {});
  await pool.query(`DELETE FROM payment_wallet_claims WHERE payment_id LIKE $1`, [`${RUN}%`]).catch(() => {});
  await pool.query(`DELETE FROM payment_escrow_events WHERE payment_id LIKE $1`, [`${RUN}%`]).catch(() => {});
  await pool.query(`DELETE FROM ledger_entries WHERE payment_id LIKE $1 OR idempotency_key LIKE $1`, [`${RUN}%`]).catch(
    () => {},
  );
  await pool.query(`DELETE FROM wallets WHERE user_id::text LIKE $1`, [`${fixtureWalletUserId}%`]).catch(() => {});
  await pool.query(`DELETE FROM gateway_transactions WHERE external_ref LIKE $1`, [`${RUN}%`]).catch(() => {});
}

/**
 * Ordering + read-only proofs (sources only — orchestrator/worker untouched).
 */
function sectionOrderingAndReadOnlyProofs() {
  console.log('\n[§13] Ordering + immutability (source)');
  const q = readFileSync(join(backendDir, 'lib', 'paymentStateQueries.js'), 'utf8');
  assert(
    /FROM ledger_entries[\s\S]{0,220}ORDER BY id ASC/im.test(q),
    '§13 ledger evidence ORDER BY id ASC',
  );
  assert(
    !/FROM ledger_entries[\s\S]{0,260}ORDER BY[^\n]{0,90}created_at/im.test(q),
    '§13 ledger load has no ORDER BY created_at',
  );

  const rec = readFileSync(join(backendDir, 'lib', 'paymentReconciliationActions.js'), 'utf8');
  assert(!/\bINSERT\s+INTO\s+ledger_entries\b/im.test(rec), '§13 reconciliation actions never INSERT ledger');
  assert(!/\bDELETE\s+FROM\s+ledger_entries\b/im.test(rec), '§13 reconciliation actions never DELETE ledger');

  const proj = readFileSync(join(backendDir, 'lib', 'paymentStateProjection.js'), 'utf8');
  assert(/ORDER BY id ASC/.test(proj) || proj.includes('ledger_entries.id'), '§13 projection uses id ordering invariant');
}

function sectionUxContractPure() {
  console.log('\n[§10] UX response contract (pure)');
  const uxTerm = presentUxPaymentFromProjection(
    { payment_id: 'pay_x', projection_state: PROJECTION_STATES.PAYMENT_CONFIRMED },
    { trace_id: 't1', display_amount: '10' },
  );
  assert(uxTerm.poll_after_ms === 0, '§10 terminal poll_after_ms===0');

  assert(
    uxTerm.status === UX_PAYMENT_STATUS.completed && !String(uxTerm.status).includes('CAPTURED'),
    '§10 canonical completed status (no raw gateway token)',
  );
  assert(uxTerm.status_version === UX_STATUS_VERSION.completed, '§10 status_version maps to preset');

  assert(
    shouldDiscardStaleUx(UX_STATUS_VERSION.completed, UX_STATUS_VERSION.pending) === true,
    '§10 stale low version discarded vs higher stored',
  );
  assert(
    shouldDiscardStaleUx(UX_STATUS_VERSION.pending, UX_STATUS_VERSION.completed) === false,
    '§10 newer incoming keeps',
  );
}

function sectionRetryDlqPure() {
  console.log('\n[§4] Retry schedule + DLQ threshold (pure)');
  assert(
    RETRY_SCHEDULE_SECONDS.length === 4 &&
      RETRY_SCHEDULE_SECONDS[0] === 30 &&
      RETRY_SCHEDULE_SECONDS[1] === 120 &&
      RETRY_SCHEDULE_SECONDS[2] === 600 &&
      RETRY_SCHEDULE_SECONDS[3] === 1800,
    '§4 fixed schedule 30→120→600→1800',
  );
  for (let a = 1; a <= 4; a++) {
    assert(
      computeRetryDelaySeconds(a) === RETRY_SCHEDULE_SECONDS[a - 1],
      `§4 delay attempt ${a}`,
    );
  }
  assert(computeRetryDelaySeconds(5) === null, '§4 attempt≥5 ⇒ exhausted (DLQ path)');
}

function sectionReconciliationPure() {
  console.log('\n[§9] Reconciliation safety (pure)');
  const base = {
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
  };
  const mismatch = classifyPaymentCoreReconciliation({
    ...base,
    gateway_amount_minor: 10000,
    ledger_amount_minor: 10000 + AMOUNT_TOLERANCE_MINOR + 50,
    provider_amount_minor: 10000,
  });
  assert(mismatch.status === RECONCILIATION_STATUS.AMOUNT_MISMATCH, '§9 amount mismatch status');
  assert(
    mismatch.next_action === RECONCILIATION_NEXT_ACTION.FREEZE_AND_MANUAL_REVIEW,
    '§9 freeze/manual_review only — no auto-settle',
  );

  const down = classifyPaymentCoreReconciliation({
    ...base,
    provider_available: false,
    provider_data_complete: false,
  });
  assert(down.status === RECONCILIATION_STATUS.PROVIDER_UNAVAILABLE, '§9 provider down');
  assert(
    down.next_action === RECONCILIATION_NEXT_ACTION.RETRY_RECONCILIATION_LATER,
    '§9 retry_reconciliation_later',
  );
}

async function sectionRuntimeLedgerAppendOnlyProbe() {
  console.log('\n[§13] Runtime — append-only ledger');
  let hit = false;
  const lr = await pool.query(`SELECT id FROM ledger_entries ORDER BY id DESC LIMIT 1`).catch(() => ({ rows: [] }));
  if (lr.rows?.[0]?.id != null) {
    try {
      await pool.query(`UPDATE ledger_entries SET description = description WHERE id = $1`, [lr.rows[0].id]);
    } catch (e) {
      const m = String(e?.message || e).toLowerCase();
      hit = m.includes('append-only') || m.includes('not allowed');
    }
  }
  assert(hit || !lr.rows?.length, '§13 UPDATE rejected when ledger has rows', String(hit));
}

async function sectionDuplicateReplayWallet() {
  console.log('\n[§1+§6] Duplicate webhook replay — wallet (exactly-once business effect)');
  const extRef = `${RUN}_dup_w`;
  const eventId = `${RUN}_evt_dup_w`;
  await insertGatewayTx({ extRef, amountMinor: 10000 });
  const payload = paysoPayload({ extRef, amountThb: 100, eventId });
  const job = await insertWebhookJob({ eventId, payload });

  const before = await ledgerCount(`WHERE payment_id = $1 AND event_type = 'WALLET_CREDIT'`, [extRef]);

  const r1 = await processWebhookJob(pool, job);
  assert(r1.status === 'processed', '§1 first process', JSON.stringify(r1));

  const after1 = await ledgerCount(`WHERE payment_id = $1 AND event_type = 'WALLET_CREDIT'`, [extRef]);
  assert(after1 === before + 1, `§6 exactly one WALLET_CREDIT (${before}->${after1})`);

  const domain1 = await outboundCount(extRef);
  /** second call same locked row replays orchestrator marker path */
  const r2 = await processWebhookJob(pool, job);
  assert(r2.status === 'skipped' || r2.status === 'processed', '§1 second in-process replay safe', r2.status);

  const after2 = await ledgerCount(`WHERE payment_id = $1 AND event_type = 'WALLET_CREDIT'`, [extRef]);
  assert(after2 === after1, `§1 no duplicate ledger (${after1}->${after2})`);

  const domain2 = await outboundCount(extRef);
  assert(domain2 >= domain1, '§6 outbound monotonic');

  /** User-level wallet credits: replay must not accumulate duplicate handler rows */
  if (fixtureWalletUserId) {
    const lc = await ledgerCount(`WHERE user_id::text = $1 AND event_type = 'WALLET_CREDIT'`, [fixtureWalletUserId]);
    assert(lc >= after2, '§6 user WALLET_CREDIT rows present');
  }
}

async function sectionInvalidSignature() {
  console.log('\n[§2] Invalid signature — hard_failed, no settlement ledger');
  setSignatureVerifier(() => ({ ok: false, failure_code: 'INVALID_SIGNATURE' }));

  const extRef = `${RUN}_bad_sig`;
  const eventId = `${RUN}_evt_bad_sig`;
  await insertGatewayTx({ extRef });
  const payload = paysoPayload({ extRef, eventId });
  const job = await insertWebhookJob({ eventId, payload });

  const before = await ledgerCount(`WHERE payment_id = $1`, [extRef]);
  const r = await processWebhookJob(pool, job);
  setSignatureVerifier(null);

  assert(r.status === 'failed' && r.retryable === false, '§2 non-retryable failure', JSON.stringify(r));
  assert(/INVALID_SIGNATURE|signature/i.test(String(r.reason)), '§2 reason traceable');

  const after = await ledgerCount(`WHERE payment_id = $1`, [extRef]);
  assert(after === before, `§12 no ledger for hard-failed signature (${before})`);

  const j = await pool.query(`SELECT status, retryable, last_error FROM payment_webhook_jobs WHERE id=$1::uuid`, [
    job.id,
  ]);
  assert(j.rows?.[0]?.status === 'hard_failed', '§2 job hard_failed');
  assert(j.rows?.[0]?.retryable === false, '§2 retryable=FALSE');
}

async function sectionAmountMismatchValidation() {
  console.log('\n[§3] Amount mismatch — business validate fails, no ledger/outbound');
  const extRef = `${RUN}_amt_bad`;
  const eventId = `${RUN}_evt_amt_bad`;
  await insertGatewayTx({ extRef, amountMinor: 10000 });
  /** gateway 100 THB, webhook says 200 THB → wallet_topup_webhook_amount_mismatch */
  const payload = paysoPayload({ extRef, amountThb: 200, eventId });
  const job = await insertWebhookJob({ eventId, payload });

  const beforeL = await ledgerCount(`WHERE payment_id = $1`, [extRef]);
  const beforeO = await outboundCount(extRef);
  const r = await processWebhookJob(pool, job);

  assert(r.status === 'failed' && r.retryable === false, '§3 hard fail validation', JSON.stringify(r));

  const afterL = await ledgerCount(`WHERE payment_id = $1`, [extRef]);
  assert(afterL === beforeL, '§3 no ledger mutation on mismatch');

  const afterO = await outboundCount(extRef);
  assert(afterO === beforeO, '§3 no new outbound rows');

  const gt = await pool.query(`SELECT status FROM gateway_transactions WHERE external_ref=$1`, [extRef]);
  /** rolled back transition — stays PENDING */
  assert(String(gt.rows?.[0]?.status || '').toUpperCase() === 'PENDING', '§3 gateway not CAPTUREd after rollback');
}

async function sectionUnknownPurpose() {
  console.log('\n[§5] Unknown purpose — deterministic failure');
  const extRef = `${RUN}_unknown_purpose`;
  const eventId = `${RUN}_evt_unk`;
  await insertGatewayTx({ extRef });
  const payload = paysoPayload({ extRef, eventId, purpose: `${RUN}_not_a_registered_purpose_xyz` });
  const job = await insertWebhookJob({ eventId, payload });

  const before = await ledgerCount(`WHERE payment_id = $1`, [extRef]);
  const r = await processWebhookJob(pool, job);

  assert(r.status === 'failed', '§5 fails', JSON.stringify(r));
  assert(/unknown_payment_purpose/i.test(String(r.reason)), '§5 failure_code path');

  const after = await ledgerCount(`WHERE payment_id = $1`, [extRef]);
  assert(after === before, '§5 zero ledger mutations');
}

async function sectionConcurrentDuplicateWebhooks() {
  console.log('\n[§11] Concurrent deliveries — same event_id, distinct job rows');
  const extRef = `${RUN}_conc`;
  const eventId = `${RUN}_evt_conc`;
  await insertGatewayTx({ extRef, amountMinor: 10000 });
  const payload = paysoPayload({ extRef, eventId });
  const j1 = await insertWebhookJob({ eventId, payload, suffix: 'a' });
  const j2 = await insertWebhookJob({ eventId, payload, suffix: 'b' });

  const lc0 = await ledgerCount(`WHERE payment_id = $1 AND event_type = 'WALLET_CREDIT'`, [extRef]);
  await Promise.all([processWebhookJob(pool, j1), processWebhookJob(pool, j2)]);

  const lc1 = await ledgerCount(`WHERE payment_id = $1 AND event_type = 'WALLET_CREDIT'`, [extRef]);
  assert(lc1 === lc0 + 1, `§11 exactly one WALLET_CREDIT (${lc0}->${lc1})`);

  const ob = await outboundCount(extRef);
  /** event_name,idempotency unique — at most incremental by 1 wallet event */
  assert(ob <= lc1 + 2, `§11 bounded outbound (${ob})`);
}

async function sectionJobCheckoutOrderingAndDup() {
  console.log('\n[§7] Job checkout — PAYMENT_COMPLETED.id < ESCROW_HOLD.id ; duplicate execute idempotent');

  const extRef = `${RUN}_jobco`;
  const jobRef = `job_${RUN}_esc`;

  /** Handler runs from synthetic payment mirror (gateway row optional for worker; here registry execute only). */
  const payment = {
    external_ref: extRef,
    merchant_reference: extRef,
    amount_minor: 50000,
    currency: 'THB',
    client_reference_id: jobRef,
    trace_id: `${RUN}:job`,
    metadata: {},
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const evt = { event_id: `${RUN}_job_evt`, trace_id: `${RUN}:job` };
    const out1 = await jobCheckoutHandler.execute(client, payment, evt);
    const out2 = await jobCheckoutHandler.execute(client, payment, evt);

    assert(!!out1.ledger, '§7 first returns ledger anchor');
    const rows = await client.query(
      `SELECT id::bigint, event_type FROM ledger_entries WHERE payment_id = $1 ORDER BY id ASC`,
      [extRef],
    );
    assert(rows.rows.length >= 2, `§7 at least PAYMENT_COMPLETED+ESCROW_HOLD (${rows.rows.length})`);

    const types = rows.rows.map((x) => x.event_type);
    const iPc = types.indexOf('PAYMENT_COMPLETED');
    const iH = types.indexOf('ESCROW_HOLD');
    assert(iPc >= 0 && iH >= 0 && rows.rows[iPc].id < rows.rows[iH].id, '§7 PAYMENT_COMPLETED.id < ESCROW_HOLD.id');

    const holdLedger = rows.rows.filter((x) => x.event_type === 'ESCROW_HOLD');
    assert(holdLedger.length === 1, `§7 one ESCROW_HOLD (${holdLedger.length})`);

    /** Second invoke: escrow insert ON CONFLICT → no RETURNING → handler returns empty-ish */
    assert(
      (!out2.ledger?.id || Number(out2.ledger?.amount) === Number(out1.ledger?.amount)) && holdLedger.length === 1,
      '§7 duplicate execute stays single ESCROW_HOLD',
    );

    await client.query('ROLLBACK');
  } finally {
    client.release();
  }
}

async function sectionEscrowDoubleRelease() {
  console.log('\n[§8] Escrow release — double call idempotent (one ESCROW_RELEASED)');
  const extRef = `${RUN}_rel`;
  const jobRef = `job_${RUN}_rel`;

  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(
      `INSERT INTO gateway_transactions (external_ref, merchant_reference, amount_minor, currency, status)
       VALUES ($1,$1,$2,'THB','PENDING')`,
      [extRef, 50000],
    );
    await c.query(
      `UPDATE gateway_transactions SET status='CAPTURED', settlement_status='PAYMENT_CONFIRMED' WHERE external_ref=$1`,
      [extRef],
    );

    const payment = {
      external_ref: extRef,
      merchant_reference: extRef,
      amount_minor: 50000,
      currency: 'THB',
      client_reference_id: jobRef,
      trace_id: `${RUN}:rel`,
      metadata: {},
    };
    const evt = { event_id: `${RUN}_rel_evt`, trace_id: `${RUN}:rel` };

    await jobCheckoutHandler.execute(c, payment, evt);

    const r1 = await executeEscrowReleaseSettlement(c, {
      paymentId: extRef,
      actor: RUN,
      reason: 'phase1a_regression',
      traceId: `${RUN}:r1`,
      skipJobCompletionGuard: true,
    });
    assert(r1.ok === true, `§8 first release ok ${JSON.stringify(r1)}`);

    const r2 = await executeEscrowReleaseSettlement(c, {
      paymentId: extRef,
      actor: RUN,
      reason: 'phase1a_regression_repeat',
      traceId: `${RUN}:r2`,
      skipJobCompletionGuard: true,
    });
    assert(r2.ok === true && r2.idempotent === true, `§8 second idempotent ${JSON.stringify(r2)}`);

    const cnt = await c.query(
      `SELECT COUNT(*)::int AS c FROM ledger_entries WHERE payment_id=$1 AND event_type='ESCROW_RELEASED'`,
      [extRef],
    );
    assert((cnt.rows?.[0]?.c ?? 0) === 1, `§8 one ESCROW_RELEASED (${cnt.rows?.[0]?.c})`);

    await c.query('ROLLBACK');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

async function sectionWalletDupExecuteSameTx() {
  console.log('\n[§6] Wallet execute twice — one credit row');
  const extRef = `${RUN}_w2`;
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const payment = {
      external_ref: extRef,
      amount_minor: 10000,
      currency: 'THB',
      user_id: fixtureWalletUserId || 'user_fallback',
      metadata: fixtureWalletUserId ? { user_id: fixtureWalletUserId } : {},
      trace_id: `${RUN}:w2`,
    };
    const normalized = { amount: 100, trace_id: `${RUN}:w2`, event_id: `${RUN}:w2`, purpose: 'wallet_topup' };
    const x1 = await walletTopupHandler.execute(c, payment, normalized);
    const x2 = await walletTopupHandler.execute(c, payment, normalized);
    const hasRows = (
      await c.query(`SELECT COUNT(*)::int AS c FROM ledger_entries WHERE payment_id = $1 AND event_type='WALLET_CREDIT'`, [
        extRef,
      ])
    ).rows[0]?.c;
    assert(hasRows <= 1, `§6 at most one row in-tx (${hasRows})`);
    assert((!x2.ledger && x1.ledger) || x1.ledger?.id === x2.ledger?.id, '§6 second converges');

    await c.query('ROLLBACK');
  } finally {
    c.release();
  }
}

async function sectionDlqFinalizeRow() {
  console.log('\n[§4] Dead letter row — persisted terminal status');
  const eventId = `${RUN}_evt_dlq_manual`;
  const traceId = `${RUN}:${eventId}`;
  const ins = await pool.query(
    `INSERT INTO payment_webhook_jobs (
       provider, event_id, event_type, trace_id,
       headers_json, payload_json, payload_sha256, idempotency_key,
       status, retryable, attempt_count, next_attempt_at
     )
     VALUES ($1,$2,'payment_confirmed',$3,'{}'::jsonb,'{}'::jsonb,'noop',$4,'processing',TRUE,6,NOW())
     RETURNING *`,
    [PROVIDER, eventId, traceId, `${PROVIDER}:${eventId}:dlq`],
  );
  const job = ins.rows[0];
  await finalizeDeadLetter(pool, job, new Error('max_retries_exceeded'), {
    reason: 'max_retries_exceeded',
  });
  const st = await pool.query(`SELECT status, dead_letter_reason FROM payment_webhook_jobs WHERE id=$1::uuid`, [job.id]);
  assert(st.rows?.[0]?.status === 'dead_letter', '§4 dead_letter status');
}

(async () => {
  console.log(`\nTask 18 — Phase 1A regression (RUN=${RUN})\n`);

  try {
    setSignatureVerifier(null);
    setBusinessActionResolver(null);

    const uidRes = await pool.query(`SELECT id::text AS id FROM users LIMIT 1`);
    fixtureWalletUserId = String(uidRes.rows?.[0]?.id || '').trim();
    assert(!!fixtureWalletUserId, 'prereq: users table needs ≥1 row for wallet fixtures');

    await cleanup();

    sectionOrderingAndReadOnlyProofs();
    sectionUxContractPure();
    sectionRetryDlqPure();
    sectionReconciliationPure();
    await sectionRuntimeLedgerAppendOnlyProbe();

    await sectionDuplicateReplayWallet();
    await sectionInvalidSignature();
    await sectionAmountMismatchValidation();
    await sectionUnknownPurpose();
    await sectionConcurrentDuplicateWebhooks();
    await sectionJobCheckoutOrderingAndDup();
    await sectionEscrowDoubleRelease();
    await sectionWalletDupExecuteSameTx();
    await sectionDlqFinalizeRow();

    /** §4 transient→success exhaustion paths: exercised by scripts/test_payment_webhook_worker.js (cases 17–21). */

    ok('coverage note: replay-safe + retry backoff integration → see test_payment_webhook_worker.js');
  } catch (e) {
    notOk('suite', (e && e.message) || String(e));
  } finally {
    setSignatureVerifier(null);
    setBusinessActionResolver(null);
    await cleanup();
    await pool.end().catch(() => {});
  }

  console.log(`\nPhase 1A regression: ${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
  console.log('[§4 full transient→retry→processed loop] covered by backend/scripts/test_payment_webhook_worker.js');
  process.exit(0);
})();
