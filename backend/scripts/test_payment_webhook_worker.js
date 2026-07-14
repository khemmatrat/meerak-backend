/**
 * Task 4.3 verification: processWebhookJob.
 *
 * Covers (per Phase 1A spec):
 *  1. Happy path PENDING → CAPTURED + marker + job=processed
 *  2. Replay: same event twice → second is skipped (already_processed)
 *  3. Race: two pre-locked jobs same event_id → one processed, one skipped
 *  4. Already paid: gateway = CAPTURED → no-op transitionable, job=processed
 *  5. Invalid transition: gateway = FAILED → hard_failed
 *  6. Validation fail: missing payment_id / invalid amount → hard_failed
 *  7. Payment not found: lookup miss → processed (warning logged)
 *  8. Retryable mid-handler: registered handler throws 08006 → job stays
 *     'processing', marker rolled back, recoverable
 *
 * Usage:
 *   node backend/scripts/test_payment_webhook_worker.js
 *   node backend/scripts/test_payment_webhook_worker.js --use-url
 *
 * Pre-req: migration 184 already applied. DB env from backend/.env or root .env.
 */
import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import crypto from 'crypto';

import {
  fetchAndLockQueuedWebhookJobs,
  finalizeDeadLetter,
  finalizeHardFail,
  finalizeRetry,
  finalizeSuccess,
  isInsideWebhookTx,
  processWebhookJob,
  RETRY_BACKOFF_SECONDS,
  RETRY_JITTER_RATIO,
  setBusinessActionResolver,
  setSignatureVerifier,
  STALE_PROCESSING_TTL_MINUTES,
} from '../lib/paymentWebhookWorker.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendDir = join(__dirname, '..');
const rootDir = join(backendDir, '..');
dotenv.config({ path: join(backendDir, '.env') });
dotenv.config({ path: join(rootDir, '.env') });

// This suite exercises webhook *business logic* with no signature verifier registered
// (setSignatureVerifier(null)). Signature verification now fails closed by default, so we must
// explicitly opt in to unverified processing here. Signature-specific behavior is covered by
// test_payment_webhook_security.js.
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
      database: process.env.DB_DATABASE || 'meera_db',
      user: process.env.DB_USER || 'meera',
      password: process.env.DB_PASSWORD || 'meera123',
      connectionTimeoutMillis: timeoutMs,
      max: 8,
    };
  }
  return {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: process.env.PGSSLMODE !== 'no-verify' },
    connectionTimeoutMillis: timeoutMs,
    max: 8,
  };
}

const pool = new pg.Pool(buildPoolConfig());

const RUN_ID = `t43_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
const PROVIDER = 'payso';

/** wallet_topup validate() requires user id on gateway row metadata.user_id */
let fixtureWalletUserId = '';

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push({ name, detail });
    console.log(`  ✗ ${name}`, detail || '');
  }
}

async function insertGatewayTx({ extRef, amountMinor = 10000, status = 'PENDING', metadata = {} }) {
  const merged = {
    ...(fixtureWalletUserId ? { user_id: fixtureWalletUserId } : {}),
    ...metadata,
  };
  const metaJson =
    merged && typeof merged === 'object' && Object.keys(merged).length
      ? JSON.stringify(merged)
      : '{}';
  const r = await pool.query(
    `INSERT INTO gateway_transactions (
       external_ref, merchant_reference, amount_minor, currency, status, metadata
     )
     VALUES ($1, $1, $2, 'THB', $3, $4::jsonb)
     RETURNING id, status, settlement_status, status_version, amount_minor, external_ref`,
    [extRef, amountMinor, status, metaJson],
  );
  return r.rows[0];
}

async function insertWebhookJob({
  eventId,
  payload,
  headers = {},
  status = 'processing',
  attemptCount = 1,
  retryable = true,
  tracePrefix = RUN_ID,
  idempotencyKeySuffix = '',
}) {
  const traceId = `${tracePrefix}:${eventId}`;
  const idemKey =
    `${PROVIDER}:${eventId}` +
    (idempotencyKeySuffix ? `:${idempotencyKeySuffix}` : '');
  const sha = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const r = await pool.query(
    `INSERT INTO payment_webhook_jobs (
       provider, event_id, event_type, trace_id,
       headers_json, payload_json, payload_sha256, idempotency_key,
       status, retryable, attempt_count, next_attempt_at
     )
     VALUES ($1, $2, 'payment_confirmed', $3, $4::jsonb, $5::jsonb, $6, $7, $8, $10, $9, NOW())
     RETURNING *`,
    [
      PROVIDER,
      eventId,
      traceId,
      JSON.stringify({ 'x-payment-gateway': PROVIDER, 'x-trace-id': traceId, ...headers }),
      JSON.stringify({ provider: PROVIDER, event_id: eventId, raw_body: JSON.stringify(payload), headers }),
      sha,
      idemKey,
      status,
      attemptCount,
      retryable,
    ],
  );
  return r.rows[0];
}

/** @param {{ extRef: string, amount?: number, eventId?: string, includePurpose?: boolean }} p */
function paysoSuccessPayload({ extRef, amount = 100, eventId, includePurpose = true }) {
  /** @type {Record<string,string>} */
  const metadata = { meerak_order_id: extRef };
  if (includePurpose) metadata.purpose = 'wallet_topup';
  return {
    id: eventId,
    event_id: eventId,
    event: 'payment.success',
    provider: PROVIDER,
    data: {
      status: 'paid',
      amount,
      currency: 'THB',
      merchant_order_id: extRef,
      paid_at: new Date().toISOString(),
      metadata,
    },
  };
}

async function getMarker(eventId) {
  const r = await pool.query(
    `SELECT processed_at, trace_id FROM processed_webhook_events WHERE provider=$1 AND event_id=$2`,
    [PROVIDER, eventId],
  );
  return r.rows[0] || null;
}

async function getGatewayTx(extRef) {
  const r = await pool.query(
    `SELECT id, status, settlement_status, status_version FROM gateway_transactions WHERE external_ref=$1`,
    [extRef],
  );
  return r.rows[0] || null;
}

async function getJob(jobId) {
  const r = await pool.query(
    `SELECT id, status, retryable, last_error, processed_at FROM payment_webhook_jobs WHERE id=$1::uuid`,
    [jobId],
  );
  return r.rows[0] || null;
}

async function cleanupRun() {
  await pool.query(`DELETE FROM processed_webhook_events WHERE event_id LIKE $1`, [`${RUN_ID}%`]).catch(() => {});
  await pool.query(`DELETE FROM payment_webhook_event_dedupe WHERE event_id LIKE $1`, [`${RUN_ID}%`]).catch(() => {});
  await pool.query(`DELETE FROM payment_webhook_jobs WHERE event_id LIKE $1`, [`${RUN_ID}%`]).catch(() => {});
  await pool.query(`DELETE FROM gateway_transactions WHERE external_ref LIKE $1`, [`${RUN_ID}%`]).catch(() => {});
}

async function runCase(name, fn) {
  console.log(`\n— ${name}`);
  try {
    await fn();
  } catch (e) {
    fail++;
    failures.push({ name, detail: e?.message || String(e) });
    console.log(`  ✗ ${name} threw:`, e?.message || e);
  }
}

(async () => {
  console.log(`▶ Task 4.3 verification (RUN_ID=${RUN_ID})\n`);

  await cleanupRun();
  // reset hooks each run
  setSignatureVerifier(null);
  setBusinessActionResolver(null);

  const uidRes = await pool.query(`SELECT id::text AS id FROM users LIMIT 1`);
  fixtureWalletUserId = String(uidRes.rows[0]?.id || '').trim();
  if (!fixtureWalletUserId) {
    console.error(
      '[test_payment_webhook_worker] prerequisite: `users` must have ≥1 row (wallet_topup needs metadata.user_id on gateway_transactions).',
    );
    await pool.end();
    process.exit(2);
  }

  // ---------------------------------------------------------------------------
  await runCase('1) Happy path: PENDING → CAPTURED + marker + processed', async () => {
    const extRef = `${RUN_ID}_happy`;
    const eventId = `${RUN_ID}_evt_happy`;
    await insertGatewayTx({ extRef });
    const job = await insertWebhookJob({
      eventId,
      payload: paysoSuccessPayload({ extRef, eventId }),
    });
    const r = await processWebhookJob(pool, job);
    ok('returns processed', r.status === 'processed', r);
    ok('transition.applied=true', r.transition?.applied === true, r.transition);
    const gt = await getGatewayTx(extRef);
    ok('gateway_transactions.status=CAPTURED', gt?.status === 'CAPTURED', gt);
    ok('settlement_status=PAYMENT_CONFIRMED', gt?.settlement_status === 'PAYMENT_CONFIRMED', gt);
    ok('status_version=2', Number(gt?.status_version) === 2, gt);
    const marker = await getMarker(eventId);
    ok('marker exists', !!marker, marker);
    const j = await getJob(job.id);
    ok('job.status=processed', j?.status === 'processed', j);
  });

  // ---------------------------------------------------------------------------
  await runCase('2) Replay (same event_id twice) → second skipped', async () => {
    const extRef = `${RUN_ID}_replay`;
    const eventId = `${RUN_ID}_evt_replay`;
    await insertGatewayTx({ extRef });
    const job1 = await insertWebhookJob({
      eventId,
      payload: paysoSuccessPayload({ extRef, eventId }),
    });
    const r1 = await processWebhookJob(pool, job1);
    ok('first run = processed', r1.status === 'processed', r1.reason);

    // Simulate a second job for same event (e.g. intake race)
    const job2 = await insertWebhookJob({
      eventId,
      payload: paysoSuccessPayload({ extRef, eventId }),
      idempotencyKeySuffix: 'intake_duplicate',
    });
    const r2 = await processWebhookJob(pool, job2);
    ok('second run = skipped (already_processed)',
       r2.status === 'skipped' && r2.reason === 'already_processed', r2);

    const gt = await getGatewayTx(extRef);
    ok('status_version still = 2 (no double transition)', Number(gt?.status_version) === 2, gt);
  });

  // ---------------------------------------------------------------------------
  await runCase('3) Race: 2 workers same event_id concurrently', async () => {
    const extRef = `${RUN_ID}_race`;
    const eventId = `${RUN_ID}_evt_race`;
    await insertGatewayTx({ extRef });
    const jobA = await insertWebhookJob({
      eventId, payload: paysoSuccessPayload({ extRef, eventId }), idempotencyKeySuffix: 'race_a',
    });
    const jobB = await insertWebhookJob({
      eventId, payload: paysoSuccessPayload({ extRef, eventId }), idempotencyKeySuffix: 'race_b',
    });
    const [rA, rB] = await Promise.all([
      processWebhookJob(pool, jobA),
      processWebhookJob(pool, jobB),
    ]);
    const statuses = [rA.status, rB.status].sort();
    ok('one processed + one skipped',
       statuses[0] === 'processed' && statuses[1] === 'skipped',
       { rA: rA.status, rB: rB.status });
    const gt = await getGatewayTx(extRef);
    ok('status_version=2 (single transition)', Number(gt?.status_version) === 2, gt);
  });

  // ---------------------------------------------------------------------------
  await runCase('4) Already paid (CAPTURED) → no-op, processed', async () => {
    const extRef = `${RUN_ID}_already`;
    const eventId = `${RUN_ID}_evt_already`;
    await insertGatewayTx({ extRef, status: 'CAPTURED' });
    const job = await insertWebhookJob({
      eventId, payload: paysoSuccessPayload({ extRef, eventId }),
    });
    const r = await processWebhookJob(pool, job);
    ok('status=processed', r.status === 'processed', r);
    ok('transition.reason=already_paid', r.transition?.reason === 'already_paid', r.transition);
    ok('transition.applied=false', r.transition?.applied === false, r.transition);
  });

  // ---------------------------------------------------------------------------
  await runCase('5) Invalid transition (FAILED → CAPTURED) → hard_failed', async () => {
    const extRef = `${RUN_ID}_invalid`;
    const eventId = `${RUN_ID}_evt_invalid`;
    await insertGatewayTx({ extRef, status: 'FAILED' });
    const job = await insertWebhookJob({
      eventId, payload: paysoSuccessPayload({ extRef, eventId }),
    });
    const r = await processWebhookJob(pool, job);
    ok('status=failed, retryable=false',
       r.status === 'failed' && r.retryable === false, r);
    ok('reason=invalid_transition', r.reason === 'invalid_transition', r);
    const j = await getJob(job.id);
    ok('job.status=hard_failed', j?.status === 'hard_failed', j);
    const marker = await getMarker(eventId);
    ok('marker rolled back (no leak on hard_failed)', !marker, marker);
  });

  // ---------------------------------------------------------------------------
  await runCase('6) Validation fail (missing payment_id) → hard_failed', async () => {
    const eventId = `${RUN_ID}_evt_validate`;
    const badPayload = {
      id: eventId,
      event: 'payment.success',
      data: { status: 'paid', amount: 100, currency: 'THB' }, // no merchant_order_id / metadata
    };
    const job = await insertWebhookJob({ eventId, payload: badPayload });
    const r = await processWebhookJob(pool, job);
    ok('failed non-retryable', r.status === 'failed' && r.retryable === false, r);
    ok('reason=missing_payment_id', r.reason === 'missing_payment_id', r);
    const j = await getJob(job.id);
    ok('job.status=hard_failed', j?.status === 'hard_failed', j);
  });

  // ---------------------------------------------------------------------------
  await runCase('7) Payment not found (no gateway_transactions) → processed + warning', async () => {
    const extRef = `${RUN_ID}_nopayment`;
    const eventId = `${RUN_ID}_evt_nopayment`;
    // intentionally do NOT insert gateway_transactions
    const job = await insertWebhookJob({
      eventId,
      payload: paysoSuccessPayload({ extRef, eventId, includePurpose: false }),
    });
    const warns = [];
    const orig = console.warn;
    console.warn = (...a) => { warns.push(a); orig.apply(console, a); };
    try {
      const r = await processWebhookJob(pool, job);
      ok('status=processed', r.status === 'processed', r);
      ok('transition.reason=payment_not_found', r.transition?.reason === 'payment_not_found', r.transition);
      ok('warning logged', warns.some((w) =>
        String(w?.[0] || '').includes('without business effect')), warns.length);
    } finally {
      console.warn = orig;
    }
  });

  // ---------------------------------------------------------------------------
  await runCase('8) Retryable mid-handler (08006) → marker released, scheduled for retry', async () => {
    const extRef = `${RUN_ID}_retry`;
    const eventId = `${RUN_ID}_evt_retry`;
    await insertGatewayTx({ extRef });
    // attempt_count=1 → backoff = RETRY_BACKOFF_SECONDS[0] (30s)
    const job = await insertWebhookJob({
      eventId, payload: paysoSuccessPayload({ extRef, eventId }), attemptCount: 1,
    });
    setBusinessActionResolver(() => ({
      validate: () => ({ ok: true }),
      execute: async () => {
        const e = new Error('connection_failure_simulated');
        e.code = '08006';
        throw e;
      },
    }));
    try {
      const r = await processWebhookJob(pool, job);
      ok('status=failed retryable=true',
         r.status === 'failed' && r.retryable === true, r);
      ok('reason=retryable_error', r.reason === 'retryable_error', r);
      ok('retry.dlq=false', r.retry?.dlq === false, r.retry);
      const base = RETRY_BACKOFF_SECONDS[0];
      const maxWithJitter = base * (1 + RETRY_JITTER_RATIO);
      ok(`retry.seconds in [${base}, ${maxWithJitter}] with jitter`,
         r.retry?.seconds >= base && r.retry?.seconds <= maxWithJitter,
         r.retry);
      const marker = await getMarker(eventId);
      ok('marker released (rollback)', !marker, marker);
      const j = await pool.query(
        `SELECT status, retryable, last_error,
                EXTRACT(EPOCH FROM (next_attempt_at - NOW())) AS delay_sec
         FROM payment_webhook_jobs WHERE id=$1::uuid`, [job.id]);
      const row = j.rows[0];
      ok('job moved back to queued', row?.status === 'queued', row);
      ok('job stays retryable', row?.retryable === true, row);
      const delay = Number(row?.delay_sec || 0);
      // Allow +/- 2s clock slack on top of the jitter window.
      ok(`next_attempt_at within [${base - 2}, ${maxWithJitter + 2}]s (got ${delay.toFixed(1)}s)`,
         delay >= base - 2 && delay <= maxWithJitter + 2,
         { delay, base, maxWithJitter });
      const gt = await getGatewayTx(extRef);
      ok('gateway_transactions still PENDING (rolled back)',
         gt?.status === 'PENDING' && Number(gt?.status_version) === 1, gt);

      // Recovery run: clear handler, simulate stale-requeuer fast-forward
      // (next_attempt_at past → fetch picks it up). For this test we bypass
      // the schedule and call processWebhookJob directly with an updated
      // attempt_count to mimic a fresh fetch.
      setBusinessActionResolver(null);
      await pool.query(
        `UPDATE payment_webhook_jobs
         SET status='processing', attempt_count=attempt_count+1, updated_at=NOW(), next_attempt_at=NOW()
         WHERE id=$1::uuid`, [job.id]);
      const refetched = await getJob(job.id);
      const r2 = await processWebhookJob(pool, { ...job, ...refetched, attempt_count: 2 });
      ok('recovery run = processed', r2.status === 'processed', r2);
      const gt2 = await getGatewayTx(extRef);
      ok('recovery transitions to CAPTURED',
         gt2?.status === 'CAPTURED' && Number(gt2?.status_version) === 2, gt2);
    } finally {
      setBusinessActionResolver(null);
    }
  });

  // ---------------------------------------------------------------------------
  await runCase('9) Bad signature verifier → hard_failed', async () => {
    const extRef = `${RUN_ID}_sig`;
    const eventId = `${RUN_ID}_evt_sig`;
    await insertGatewayTx({ extRef });
    const job = await insertWebhookJob({
      eventId, payload: paysoSuccessPayload({ extRef, eventId }),
    });
    setSignatureVerifier(() => ({ ok: false, failure_code: 'invalid_signature' }));
    try {
      const r = await processWebhookJob(pool, job);
      ok('failed non-retryable', r.status === 'failed' && r.retryable === false, r);
      ok('reason=invalid_signature', r.reason === 'invalid_signature', r);
      const marker = await getMarker(eventId);
      ok('marker released on signature fail', !marker, marker);
      const gt = await getGatewayTx(extRef);
      ok('gateway_transactions stays PENDING', gt?.status === 'PENDING', gt);
    } finally {
      setSignatureVerifier(null);
    }
  });

  // ---------------------------------------------------------------------------
  await runCase('10) Business handler validate fail → hard_failed', async () => {
    const extRef = `${RUN_ID}_bizval`;
    const eventId = `${RUN_ID}_evt_bizval`;
    await insertGatewayTx({ extRef });
    const job = await insertWebhookJob({
      eventId, payload: paysoSuccessPayload({ extRef, eventId }),
    });
    setBusinessActionResolver(() => ({
      validate: () => ({ ok: false, failure_code: 'amount_mismatch' }),
      execute: async () => { throw new Error('should not run'); },
    }));
    try {
      const r = await processWebhookJob(pool, job);
      ok('failed non-retryable', r.status === 'failed' && r.retryable === false, r);
      ok('reason=amount_mismatch', r.reason === 'amount_mismatch', r);
      const gt = await getGatewayTx(extRef);
      ok('gateway_transactions rolled back to PENDING',
         gt?.status === 'PENDING' && Number(gt?.status_version) === 1, gt);
    } finally {
      setBusinessActionResolver(null);
    }
  });

  // ---------------------------------------------------------------------------
  await runCase('11) DLQ on max retries: attempt_count exceeds backoff schedule', async () => {
    const extRef = `${RUN_ID}_dlq`;
    const eventId = `${RUN_ID}_evt_dlq`;
    await insertGatewayTx({ extRef });
    // attempt_count = backoff length + 1 → next failure goes straight to DLQ
    const job = await insertWebhookJob({
      eventId, payload: paysoSuccessPayload({ extRef, eventId }),
      attemptCount: RETRY_BACKOFF_SECONDS.length + 1,
    });
    setBusinessActionResolver(() => ({
      validate: () => ({ ok: true }),
      execute: async () => {
        const e = new Error('still_flapping');
        e.code = '08006';
        throw e;
      },
    }));
    try {
      const r = await processWebhookJob(pool, job);
      ok('status=failed', r.status === 'failed', r);
      ok('reason=dead_letter', r.reason === 'dead_letter', r);
      ok('retry.dlq=true', r.retry?.dlq === true, r.retry);
      ok('retryable=false (DLQ is terminal)', r.retryable === false, r);
      const row = await pool.query(
        `SELECT status, dead_lettered_at, last_error FROM payment_webhook_jobs WHERE id=$1::uuid`,
        [job.id]);
      ok('job.status=dead_letter', row.rows[0]?.status === 'dead_letter', row.rows[0]);
      ok('dead_lettered_at set', !!row.rows[0]?.dead_lettered_at, row.rows[0]);
      const marker = await getMarker(eventId);
      ok('marker released (DLQ rollback)', !marker, marker);
    } finally {
      setBusinessActionResolver(null);
    }
  });

  // ---------------------------------------------------------------------------
  await runCase('12) Hard-fail audit log carries trace_id, event_id, raw_hash, attempt_count', async () => {
    const extRef = `${RUN_ID}_audit`;
    const eventId = `${RUN_ID}_evt_audit`;
    await insertGatewayTx({ extRef, status: 'FAILED' }); // forces invalid_transition
    const job = await insertWebhookJob({
      eventId, payload: paysoSuccessPayload({ extRef, eventId }), attemptCount: 3,
    });

    const errs = [];
    const orig = console.error;
    console.error = (...a) => { errs.push(a); /* swallow during test */ };
    try {
      const r = await processWebhookJob(pool, job);
      console.error = orig;
      ok('status=failed', r.status === 'failed' && r.reason === 'invalid_transition', r);
      const auditCall = errs.find((a) =>
        String(a?.[0] || '').includes('hard_failed') && a?.[1]);
      ok('audit log emitted', !!auditCall, errs.length);
      const audit = auditCall?.[1] || {};
      ok('audit.failure_code present', !!audit.failure_code, audit);
      ok('audit.trace_id present', !!audit.trace_id, audit);
      ok('audit.event_id matches', audit.event_id === eventId, audit);
      ok('audit.raw_hash present', !!audit.raw_hash, audit);
      ok('audit.attempt_count=3', audit.attempt_count === 3, audit);
      ok('audit.provider=payso', audit.provider === PROVIDER, audit);
      ok('audit.transition_reason=invalid_transition',
         audit.transition_reason === 'invalid_transition', audit);
    } finally {
      console.error = orig;
    }
  });

  // ---------------------------------------------------------------------------
  await runCase('13) isInsideWebhookTx() flag is true inside handler.execute, false outside', async () => {
    const extRef = `${RUN_ID}_scope`;
    const eventId = `${RUN_ID}_evt_scope`;
    await insertGatewayTx({ extRef });
    const job = await insertWebhookJob({
      eventId, payload: paysoSuccessPayload({ extRef, eventId }),
    });
    let insideValidate = null;
    let insideExecute = null;
    setBusinessActionResolver(() => ({
      validate: () => { insideValidate = isInsideWebhookTx(); return { ok: true }; },
      execute: async () => { insideExecute = isInsideWebhookTx(); return { applied: true }; },
    }));
    try {
      const before = isInsideWebhookTx();
      const r = await processWebhookJob(pool, job);
      const after = isInsideWebhookTx();
      ok('processed', r.status === 'processed', r);
      ok('isInsideWebhookTx()=false outside', before === false && after === false,
         { before, after });
      ok('isInsideWebhookTx()=true inside validate', insideValidate === true, { insideValidate });
      ok('isInsideWebhookTx()=true inside execute', insideExecute === true, { insideExecute });
    } finally {
      setBusinessActionResolver(null);
    }
  });

  // ---------------------------------------------------------------------------
  await runCase('14) Constants exported (TTL + backoff schedule)', async () => {
    ok('STALE_PROCESSING_TTL_MINUTES is positive integer',
       Number.isInteger(STALE_PROCESSING_TTL_MINUTES) && STALE_PROCESSING_TTL_MINUTES > 0,
       { STALE_PROCESSING_TTL_MINUTES });
    ok('RETRY_BACKOFF_SECONDS is non-empty ascending array',
       Array.isArray(RETRY_BACKOFF_SECONDS) && RETRY_BACKOFF_SECONDS.length > 0
         && RETRY_BACKOFF_SECONDS.every((v, i, a) => i === 0 || v > a[i - 1]),
       RETRY_BACKOFF_SECONDS);
    ok('RETRY_JITTER_RATIO in [0, 1]',
       typeof RETRY_JITTER_RATIO === 'number' && RETRY_JITTER_RATIO >= 0 && RETRY_JITTER_RATIO <= 1,
       { RETRY_JITTER_RATIO });
  });

  // ---------------------------------------------------------------------------
  await runCase('15) Task 4.4: four finalize* handlers are exported and callable', async () => {
    ok('finalizeSuccess is a function', typeof finalizeSuccess === 'function');
    ok('finalizeRetry is a function', typeof finalizeRetry === 'function');
    ok('finalizeDeadLetter is a function', typeof finalizeDeadLetter === 'function');
    ok('finalizeHardFail is a function', typeof finalizeHardFail === 'function');
  });

  // ---------------------------------------------------------------------------
  await runCase('16) finalizeSuccess is idempotent on already-processed job', async () => {
    const extRef = `${RUN_ID}_idem_success`;
    const eventId = `${RUN_ID}_evt_idem_success`;
    await insertGatewayTx({ extRef });
    const job = await insertWebhookJob({
      eventId, payload: paysoSuccessPayload({ extRef, eventId }),
    });
    const r = await processWebhookJob(pool, job);
    ok('first run processed', r.status === 'processed', r);
    const before = await getJob(job.id);
    // call finalizeSuccess again on the already-processed job; must NOT regress
    await finalizeSuccess(pool, before);
    const after = await getJob(job.id);
    ok('still processed (no regression)', after?.status === 'processed', after);
    ok('processed_at unchanged',
       String(before?.processed_at) === String(after?.processed_at),
       { before: before?.processed_at, after: after?.processed_at });
  });

  // ---------------------------------------------------------------------------
  await runCase('17) finalizeRetry returns {dlq:true} when retries exhausted (delegates to DLQ)', async () => {
    const extRef = `${RUN_ID}_finretry_dlq`;
    const eventId = `${RUN_ID}_evt_finretry_dlq`;
    await insertGatewayTx({ extRef });
    const job = await insertWebhookJob({
      eventId, payload: paysoSuccessPayload({ extRef, eventId }),
      attemptCount: RETRY_BACKOFF_SECONDS.length + 2,
    });
    const r = await finalizeRetry(pool, job, new Error('flapping'));
    ok('returns dlq=true', r?.dlq === true, r);
    ok('seconds is null', r?.seconds == null, r);
    const row = await pool.query(
      `SELECT status, dead_lettered_at FROM payment_webhook_jobs WHERE id=$1::uuid`,
      [job.id]);
    ok('job.status=dead_letter (delegated)', row.rows[0]?.status === 'dead_letter', row.rows[0]);
    ok('dead_lettered_at set', !!row.rows[0]?.dead_lettered_at, row.rows[0]);
  });

  // ---------------------------------------------------------------------------
  await runCase('18) finalizeRetry jitter spread across attempts', async () => {
    // Use synthetic jobs at various attempt counts; finalizeRetry returns the
    // computed seconds. Jitter ensures seconds is in [base, base*(1+ratio)].
    const samples = [];
    for (const attemptCount of [1, 2, 3, 4]) {
      const eventId = `${RUN_ID}_evt_jitter_${attemptCount}`;
      const extRef = `${RUN_ID}_jitter_${attemptCount}`;
      await insertGatewayTx({ extRef });
      const job = await insertWebhookJob({
        eventId, payload: paysoSuccessPayload({ extRef, eventId }), attemptCount,
      });
      const r = await finalizeRetry(pool, job, new Error('transient'));
      const base = RETRY_BACKOFF_SECONDS[attemptCount - 1];
      const maxJ = base * (1 + RETRY_JITTER_RATIO);
      ok(`attempt ${attemptCount}: seconds in [${base}, ${maxJ}]`,
         r?.seconds >= base && r?.seconds <= maxJ,
         { attemptCount, seconds: r?.seconds });
      samples.push(r?.seconds);
    }
    ok('all samples are positive integers',
       samples.every((s) => Number.isInteger(s) && s > 0),
       samples);
  });

  // ---------------------------------------------------------------------------
  await runCase('19) Hardening: finalizeRetry on retryable=FALSE -> hard_failed (not retried)', async () => {
    const extRef = `${RUN_ID}_block`;
    const eventId = `${RUN_ID}_evt_block`;
    await insertGatewayTx({ extRef });
    const job = await insertWebhookJob({
      eventId, payload: paysoSuccessPayload({ extRef, eventId }),
      attemptCount: 1, retryable: false,
    });
    const r = await finalizeRetry(pool, job, new Error('any_error'));
    ok('returns blocked=true', r?.blocked === true, r);
    ok('seconds=null', r?.seconds == null, r);
    const row = await getJob(job.id);
    ok('job.status=hard_failed', row?.status === 'hard_failed', row);
    ok('last_error=retry_blocked_by_flag',
       String(row?.last_error || '').includes('retry_blocked_by_flag'), row);
  });

  // ---------------------------------------------------------------------------
  await runCase('20) Hardening: dead_letter_reason persisted (migration 185)', async () => {
    const extRef = `${RUN_ID}_dlr`;
    const eventId = `${RUN_ID}_evt_dlr`;
    await insertGatewayTx({ extRef });
    const job = await insertWebhookJob({
      eventId, payload: paysoSuccessPayload({ extRef, eventId }),
      attemptCount: RETRY_BACKOFF_SECONDS.length + 1,
    });
    await finalizeDeadLetter(pool, job, new Error('flapping'));
    const row = await pool.query(
      `SELECT status, dead_letter_reason FROM payment_webhook_jobs WHERE id=$1::uuid`,
      [job.id]);
    ok('job.status=dead_letter', row.rows[0]?.status === 'dead_letter', row.rows[0]);
    ok('dead_letter_reason=max_retries_exceeded',
       row.rows[0]?.dead_letter_reason === 'max_retries_exceeded', row.rows[0]);
  });

  // ---------------------------------------------------------------------------
  await runCase('21) Hardening: result_type field present in all finalize logs', async () => {
    const seenTypes = new Set();
    const orig = console.warn;
    const orig2 = console.error;
    const origLog = console.log;
    console.warn = (msg, data) => { if (data?.result_type) seenTypes.add(data.result_type); };
    console.error = (msg, data) => { if (data?.result_type) seenTypes.add(data.result_type); };
    console.log = (msg, data) => { if (data?.result_type) seenTypes.add(data.result_type); };
    try {
      // Trigger retry log
      await finalizeRetry(pool, await insertWebhookJob({
        eventId: `${RUN_ID}_evt_rt_retry`,
        payload: paysoSuccessPayload({ extRef: `${RUN_ID}_rt_retry`, eventId: `${RUN_ID}_evt_rt_retry` }),
        attemptCount: 1,
      }), new Error('temp'));
      // Trigger dead_letter log
      await finalizeDeadLetter(pool, await insertWebhookJob({
        eventId: `${RUN_ID}_evt_rt_dlq`,
        payload: paysoSuccessPayload({ extRef: `${RUN_ID}_rt_dlq`, eventId: `${RUN_ID}_evt_rt_dlq` }),
        attemptCount: RETRY_BACKOFF_SECONDS.length + 1,
      }), new Error('done'));
      // Trigger hard_failed log
      await finalizeHardFail(pool, await insertWebhookJob({
        eventId: `${RUN_ID}_evt_rt_hard`,
        payload: paysoSuccessPayload({ extRef: `${RUN_ID}_rt_hard`, eventId: `${RUN_ID}_evt_rt_hard` }),
      }), 'invalid_signature', { reason: 'invalid_signature', source: 'signature' });
    } finally {
      console.warn = orig;
      console.error = orig2;
      console.log = origLog;
    }
    ok('retry_scheduled logged', seenTypes.has('retry_scheduled'), [...seenTypes]);
    ok('dead_letter logged', seenTypes.has('dead_letter'), [...seenTypes]);
    ok('hard_failed logged', seenTypes.has('hard_failed'), [...seenTypes]);
  });

  // ---------------------------------------------------------------------------
  await runCase('22) Hardening: double-finalize race blocked by status guard', async () => {
    const extRef = `${RUN_ID}_double`;
    const eventId = `${RUN_ID}_evt_double`;
    await insertGatewayTx({ extRef });
    const job = await insertWebhookJob({
      eventId, payload: paysoSuccessPayload({ extRef, eventId }),
    });
    // Simulate a previous worker already moved the job to terminal hard_failed.
    await pool.query(
      `UPDATE payment_webhook_jobs SET status='hard_failed', retryable=FALSE, last_error='prior' WHERE id=$1::uuid`,
      [job.id]);

    const before = await getJob(job.id);
    // Now try every finalize* — none should regress the terminal state.
    await finalizeSuccess(pool, before);
    await finalizeRetry(pool, before, new Error('late')); // also exercises retryable=false guard
    await finalizeDeadLetter(pool, before, new Error('late'));
    await finalizeHardFail(pool, before, 'reapply');

    const after = await getJob(job.id);
    ok('status remains hard_failed (no regression)', after?.status === 'hard_failed', after);
    ok('last_error remains prior',
       String(after?.last_error || '').includes('prior'), after);
  });

  // ---------------------------------------------------------------------------
  await cleanupRun();

  console.log(`\n────────────────`);
  console.log(`Total: ${pass + fail} | Passed: ${pass} | Failed: ${fail}`);
  if (failures.length) {
    console.log(`\nFailures:`);
    for (const f of failures) console.log(` - ${f.name} :: ${JSON.stringify(f.detail)}`);
  }
  await pool.end();
  process.exit(fail === 0 ? 0 : 1);
})().catch(async (e) => {
  console.error('Fatal:', e);
  try { await cleanupRun(); } catch {}
  await pool.end().catch(() => {});
  process.exit(2);
});
