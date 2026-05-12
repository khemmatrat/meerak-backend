/**
 * Debug Task 10: run the 6 recommended cases with runtime evidence logs.
 *
 * Usage:
 *   node backend/scripts/debug_task10_job_checkout_cases.js
 *
 * Requires: DB reachable (uses backend/.env).
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';
import { jobCheckoutHandler } from '../lib/paymentBusinessActions/jobCheckoutHandler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_DATABASE || 'meera_db',
  user: process.env.DB_USER || 'meera',
  password: process.env.DB_PASSWORD || 'meera123',
  max: 4,
});

const RUN_ID = `dbg10_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

/** Avoid hung transactions (esp. concurrent case) under local DB / lock contention. */
async function withTx(pool, fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query("SET LOCAL statement_timeout = '45s'");
    await c.query("SET LOCAL lock_timeout = '15s'");
    await fn(c);
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

async function countByIdem(paymentId) {
  const pc = await pool.query(
    `SELECT COUNT(*)::int AS c FROM ledger_entries WHERE idempotency_key = $1`,
    [`payment_completed:${paymentId}`],
  );
  const eh = await pool.query(
    `SELECT COUNT(*)::int AS c FROM ledger_entries WHERE idempotency_key = $1`,
    [`escrow_hold:${paymentId}`],
  );
  return { payment_completed: pc.rows[0].c, escrow_hold: eh.rows[0].c };
}

async function fetchCreatedAt(paymentId) {
  const r = await pool.query(
    `SELECT id, idempotency_key, created_at
     FROM ledger_entries
     WHERE idempotency_key IN ($1,$2)
     ORDER BY id ASC`,
    [`payment_completed:${paymentId}`, `escrow_hold:${paymentId}`],
  );
  const byKey = new Map(r.rows.map((x) => [x.idempotency_key, x]));
  return {
    payment_completed: byKey.get(`payment_completed:${paymentId}`) || null,
    escrow_hold: byKey.get(`escrow_hold:${paymentId}`) || null,
  };
}

async function countEscrowHoldEvents(paymentId) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS c
     FROM payment_escrow_events
     WHERE payment_id = $1 AND state = 'HOLD'`,
    [String(paymentId)],
  ).catch(() => ({ rows: [{ c: 0 }] }));
  return r.rows[0].c;
}

async function case1_replay_no_double() {
  const paymentId = `pmt_${RUN_ID}_replay`;
  const jobId = `job_${RUN_ID}_replay`;
  const payment = { id: paymentId, external_ref: paymentId, amount_minor: 50000, currency: 'THB', client_reference_id: jobId, trace_id: `tr-${RUN_ID}` };
  const event = { event_id: `evt_${RUN_ID}_replay`, trace_id: `tr-${RUN_ID}` };

  for (let i = 0; i < 2; i++) {
    await withTx(pool, (c) => jobCheckoutHandler.execute(c, payment, event));
  }
  return countByIdem(paymentId);
}

async function case2_atomic_rollback_simulated_fail() {
  const paymentId = `pmt_${RUN_ID}_rollback`;
  const jobId = `job_${RUN_ID}_rollback`;
  const payment = { id: paymentId, external_ref: paymentId, amount_minor: 50000, currency: 'THB', client_reference_id: jobId, trace_id: `tr-${RUN_ID}` };
  const event = { event_id: `evt_${RUN_ID}_rollback`, trace_id: `tr-${RUN_ID}` };

  await withTx(pool, async (c) => {
    const orig = c.query.bind(c);
    try {
      c.query = (text, params) => {
        const p = params || [];
        const isEscrowHoldInsert =
          String(text || '').includes('INSERT INTO ledger_entries') && p[3] === 'ESCROW_HOLD';
        if (isEscrowHoldInsert) {
          const err = new Error('simulated_escrow_hold_insert_fail');
          err.code = 'SIMULATED_FAIL';
          throw err;
        }
        return orig(text, params);
      };
      await jobCheckoutHandler.execute(c, payment, event);
    } finally {
      c.query = orig;
    }
  }).catch(() => {});
  return countByIdem(paymentId);
}

async function case3_amount_mismatch_if_possible() {
  // Only meaningful if jobs table exists and buildMatchJobPaymentContext can compute.
  const paymentId = `pmt_${RUN_ID}_mismatch`;
  const jobId = `job_${RUN_ID}_mismatch`;
  const payment = { id: paymentId, external_ref: paymentId, amount_minor: 12345, currency: 'THB', client_reference_id: jobId, trace_id: `tr-${RUN_ID}` };
  const event = { event_id: `evt_${RUN_ID}_mismatch`, trace_id: `tr-${RUN_ID}` };

  try {
    await withTx(pool, (c) => jobCheckoutHandler.execute(c, payment, event));
  } catch (e) {
    if (String(e?.code || '') !== 'JOB_CHECKOUT_AMOUNT_MISMATCH') throw e;
  }
  return countByIdem(paymentId);
}

async function case4_payment_completed_idempotency_new_event_same_payment() {
  const paymentId = `pmt_${RUN_ID}_idem`;
  const jobId = `job_${RUN_ID}_idem`;
  const payment = { id: paymentId, external_ref: paymentId, amount_minor: 50000, currency: 'THB', client_reference_id: jobId, trace_id: `tr-${RUN_ID}` };
  const event1 = { event_id: `evt_${RUN_ID}_idem_1`, trace_id: `tr-${RUN_ID}` };
  const event2 = { event_id: `evt_${RUN_ID}_idem_2`, trace_id: `tr-${RUN_ID}` };

  for (const ev of [event1, event2]) {
    await withTx(pool, (c) => jobCheckoutHandler.execute(c, payment, ev));
  }
  return countByIdem(paymentId);
}

async function case5_concurrent_hold_uniqueness() {
  const paymentId = `pmt_${RUN_ID}_conc`;
  const jobId = `job_${RUN_ID}_conc`;
  const payment = { id: paymentId, external_ref: paymentId, amount_minor: 50000, currency: 'THB', client_reference_id: jobId, trace_id: `tr-${RUN_ID}` };
  const event = { event_id: `evt_${RUN_ID}_conc`, trace_id: `tr-${RUN_ID}` };

  await Promise.all(
    [0, 1].map(() => withTx(pool, (c) => jobCheckoutHandler.execute(c, payment, event))),
  );

  return {
    ledger: await countByIdem(paymentId),
    escrow_hold_rows: await countEscrowHoldEvents(paymentId),
  };
}

async function case6_ordering_probe() {
  const paymentId = `pmt_${RUN_ID}_order`;
  const jobId = `job_${RUN_ID}_order`;
  const payment = { id: paymentId, external_ref: paymentId, amount_minor: 50000, currency: 'THB', client_reference_id: jobId, trace_id: `tr-${RUN_ID}` };
  const event = { event_id: `evt_${RUN_ID}_order`, trace_id: `tr-${RUN_ID}` };

  await withTx(pool, (c) => jobCheckoutHandler.execute(c, payment, event));
  const o = await fetchCreatedAt(paymentId);
  return {
    payment_completed_id: o.payment_completed?.id ?? null,
    escrow_hold_id: o.escrow_hold?.id ?? null,
    payment_completed_created_at: o.payment_completed?.created_at ?? null,
    escrow_hold_created_at: o.escrow_hold?.created_at ?? null,
    deterministic_ordering_ok:
      o.payment_completed?.id != null && o.escrow_hold?.id != null
        ? Number(o.payment_completed.id) < Number(o.escrow_hold.id)
        : null,
  };
}

async function main() {
  console.log('RUN_ID', RUN_ID);
  console.log('[1] replay no double', await case1_replay_no_double());
  console.log('[2] atomic rollback (simulated fail) counts', await case2_atomic_rollback_simulated_fail());
  console.log('[3] amount mismatch (if applicable) counts', await case3_amount_mismatch_if_possible());
  console.log('[4] payment_completed idempotency (new event same payment) counts', await case4_payment_completed_idempotency_new_event_same_payment());
  console.log('[5] concurrent hold uniqueness', await case5_concurrent_hold_uniqueness());
  console.log('[6] ordering by ledger_entries.id', await case6_ordering_probe());
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  try { await pool.end(); } catch {}
  process.exitCode = 1;
});

