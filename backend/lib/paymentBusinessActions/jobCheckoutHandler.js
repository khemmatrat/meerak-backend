/**
 * Job Checkout + Escrow HOLD → RELEASE (guarded).
 *
 * HOLD metadata stores job_id so recordEscrowReleased can verify job.completed
 * unless skipJobCompletionGuard (manual / break-glass only).
 */

import { buildMatchJobPaymentContext } from '../stripeMatchJobPayment.js';
import {
  applyJobCheckoutSideEffects,
  getTableColumnNames,
  regclassExists,
} from '../jobBookingCheckoutSideEffects.js';

const AMOUNT_EPS_THB = 0.02;

/**
 * Resolve job reference for escrow RELEASE (explicit param or HOLD row metadata.job_id).
 */
export async function resolveEscrowJobReference(client, paymentId, explicitJobId) {
  const ex = explicitJobId != null ? String(explicitJobId).trim() : '';
  if (ex) return ex;
  if (!(await regclassExists(client, 'public.payment_escrow_events'))) {
    const e = new Error('payment_escrow_events table not available');
    e.code = 'ESCROW_EVENTS_SCHEMA_MISSING';
    e.nonRetryable = true;
    throw e;
  }

  const r = await client.query(
    `SELECT metadata FROM payment_escrow_events
      WHERE payment_id = $1 AND state = 'HOLD'
      ORDER BY id DESC
      LIMIT 1`,
    [String(paymentId)],
  );
  const m = r.rows[0]?.metadata;
  const fromMeta = m && typeof m === 'object' ? m.job_id || m.jobId : null;
  return fromMeta ? String(fromMeta).trim() : null;
}

/**
 * Returns true iff a known jobs table marks the assignment completed.
 *
 * Checked in order: advance_jobs (ENUM completed), jobs, job_bookings.
 */
export async function isJobCompletedForEscrow(client, jobRef) {
  if (!jobRef) return false;
  const ref = String(jobRef).trim();
  const bare = ref.replace(/^job_/i, '');
  const candidates = [...new Set([ref, bare].filter(Boolean))];
  const a = candidates[0];
  const b = candidates[1] ?? candidates[0];

  if (await regclassExists(client, 'public.advance_jobs')) {
    const x = await client.query(
      `SELECT status::text AS s FROM advance_jobs
        WHERE id::text = $1 OR id::text = $2 LIMIT 1`,
      [a, b],
    );
    if (x.rows?.[0] && String(x.rows[0].s) === 'completed') return true;
  }

  if (await regclassExists(client, 'public.jobs')) {
    const x = await client.query(
      `SELECT lower(status::text) AS s FROM jobs
        WHERE id::text = $1 OR id::text = $2 LIMIT 1`,
      [a, b],
    );
    if (x.rows?.[0] && String(x.rows[0].s) === 'completed') return true;
  }

  // job_bookings: only query when status column exists
  if (await regclassExists(client, 'public.job_bookings')) {
    const cols = await getTableColumnNames(client, 'job_bookings');
    if (cols.has('status')) {
      const ors = [];
      if (cols.has('id')) ors.push(`id::text IN ($1, $2)`);
      if (cols.has('job_id')) ors.push(`job_id::text IN ($1, $2)`);
      if (ors.length) {
        const x = await client.query(
          `SELECT 1 AS ok FROM job_bookings
            WHERE (${ors.join(' OR ')})
              AND lower(status::text) = 'completed'
            LIMIT 1`,
          [a, b],
        );
        if (x.rows?.length) return true;
      }
    }
  }

  return false;
}

/**
 * Record escrow RELEASED. Throws if job not completed (unless skipJobCompletionGuard).
 *
 * @param {import('pg').PoolClient} client
 * @param {{
 *   paymentId: string,
 *   traceId?: string|null,
 *   metadata?: object,
 *   jobId?: string|null,
 *   skipJobCompletionGuard?: boolean,
 * }} input
 */
export async function recordEscrowReleased(client, input) {
  const paymentId = String(input?.paymentId || '').trim();
  if (!paymentId) throw new Error('recordEscrowReleased: paymentId required');
  const traceId = input.traceId ?? null;
  const meta = input.metadata && typeof input.metadata === 'object' ? input.metadata : {};

  if (!(await regclassExists(client, 'public.payment_escrow_events'))) {
    const e = new Error('recordEscrowReleased: payment_escrow_events not available');
    e.code = 'ESCROW_EVENTS_SCHEMA_MISSING';
    e.nonRetryable = true;
    throw e;
  }

  if (input.skipJobCompletionGuard !== true) {
    const jobRef = await resolveEscrowJobReference(client, paymentId, input.jobId ?? input.job_id);
    if (!jobRef) {
      const e = new Error('recordEscrowReleased: jobId or HOLD.metadata.job_id required');
      e.code = 'ESCROW_RELEASE_JOB_REF_MISSING';
      e.nonRetryable = true;
      throw e;
    }
    const ok = await isJobCompletedForEscrow(client, jobRef);
    if (!ok) {
      const e = new Error('escrow_release_denied_job_not_completed');
      e.code = 'ESCROW_RELEASE_JOB_NOT_COMPLETED';
      e.nonRetryable = true;
      throw e;
    }
  }

  const ins = await client.query(
    `INSERT INTO payment_escrow_events (payment_id, state, trace_id, metadata)
     SELECT $1::text, 'RELEASED', $2, $3::jsonb
     WHERE EXISTS (
       SELECT 1 FROM payment_escrow_events e
       WHERE e.payment_id = $1::text AND e.state = 'HOLD'
     )
     AND NOT EXISTS (
       SELECT 1 FROM payment_escrow_events r
       WHERE r.payment_id = $1::text AND r.state = 'RELEASED'
     )
     ON CONFLICT (payment_id) WHERE (state = 'RELEASED') DO NOTHING
     RETURNING id`,
    [paymentId, traceId, JSON.stringify(meta)],
  );

  const inserted = ins.rows?.length > 0;
  if (inserted) return;

  const rel = await client.query(
    `SELECT 1 FROM payment_escrow_events
      WHERE payment_id = $1::text AND state = 'RELEASED' LIMIT 1`,
    [paymentId],
  );
  if (rel.rows.length) return;

  const hold = await client.query(
    `SELECT 1 FROM payment_escrow_events
      WHERE payment_id = $1::text AND state = 'HOLD' LIMIT 1`,
    [paymentId],
  );
  if (!hold.rows.length) {
    const e = new Error('escrow_release_denied_no_escrow_hold');
    e.code = 'ESCROW_RELEASE_NO_HOLD';
    e.nonRetryable = true;
    throw e;
  }

  // HOLD exists but no RELEASE row yet and we did not insert (concurrent release or
  // transient race). Treat as idempotent no-op to avoid duplicate error logs.
}

export async function validate(payment, event) {
  const jobId = payment?.client_reference_id;
  if (!jobId || !String(jobId).startsWith('job_')) {
    return { ok: false, failure_code: 'job_checkout_invalid_reference' };
  }

  const amt = Number(payment?.amount_minor || 0) / 100;
  if (amt < 100) {
    return { ok: false, failure_code: 'job_checkout_amount_too_small' };
  }

  return { ok: true };
}

export async function execute(client, payment, event) {
  const paymentId = payment?.id || payment?.external_ref;
  const jobId = payment?.client_reference_id;
  const amountMinor = Number(payment?.amount_minor || 0);
  const amountThb = amountMinor / 100;
  const amount = amountThb.toFixed(2);
  const currency = String(payment?.currency || 'THB').toUpperCase();
  const traceId = event?.trace_id || payment?.trace_id;

  // Best-effort pricing parity check for Match jobs (jobs table).
  // If jobs table is missing, skip without failing.
  const jobsReg = await client.query(`SELECT to_regclass('public.jobs') AS t`);
  const hasJobsTable = !!jobsReg.rows?.[0]?.t;
  if (hasJobsTable) {
    try {
      const ctx = await buildMatchJobPaymentContext(client, jobId, { userId: payment?.user_id || null });
      const expected = Number(ctx?.employerOutflow?.finalPrice);
      if (Number.isFinite(expected) && Math.abs(expected - amountThb) > AMOUNT_EPS_THB) {
        const e = new Error('job_checkout_amount_mismatch');
        e.code = 'JOB_CHECKOUT_AMOUNT_MISMATCH';
        e.nonRetryable = true;
        throw e;
      }
    } catch (e) {
      if (String(e?.message || '').includes('job_not_found')) {
        // In some deployments jobId refers to booking id, not jobs.id.
      } else {
        throw e;
      }
    }
  }

  // Record "payment completed" (incoming money confirmed) + escrow hold.
  // H6: insert PAYMENT_COMPLETED before ESCROW_HOLD in the same tx — ledger_entries.id is monotonic.
  const tg = (await client.query(`SELECT gen_random_uuid() AS id`)).rows?.[0]?.id || null;

  // 1) Payment completed marker (idempotent)
  await client.query(
    `INSERT INTO ledger_entries (
       idempotency_key, transaction_group_id, payment_id, user_id, event_type, direction,
       amount, currency, description, trace_id, created_at
     )
     VALUES ($1, COALESCE($10::uuid, gen_random_uuid()), $2, $3, $4, $5, $6::numeric, $7, $8, $9, NOW())
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [
      `payment_completed:${paymentId}`,
      paymentId,
      jobId,
      'PAYMENT_COMPLETED',
      'credit',
      amount,
      currency,
      `Job checkout payment completed for ${jobId}`,
      traceId,
      tg,
    ],
  );

  // 2) Escrow hold ledger row (idempotent) — return this row as handlerResult.ledger
  const ledger = await client.query(
    `INSERT INTO ledger_entries (
       idempotency_key, transaction_group_id, payment_id, user_id, event_type, direction,
       amount, currency, description, trace_id, created_at
     )
     VALUES ($1, gen_random_uuid(), $2, $3, $4, $5, $6::numeric, $7, $8, $9, NOW())
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING *`,
    [
      `escrow_hold:${paymentId}`,
      paymentId,
      jobId,
      'ESCROW_HOLD',
      'debit',
      amount,
      currency,
      `Job checkout escrow hold for ${jobId}`,
      traceId,
    ],
  );

  const ledgerEntry = ledger.rows[0] || null;
  if (!ledgerEntry) {
    return { ledger: null, domainEvents: [] };
  }

  const holdMeta = { job_id: String(jobId) };

  const hasPaymentEscrowEvents = await regclassExists(client, 'public.payment_escrow_events');
  if (hasPaymentEscrowEvents) {
    await client.query(
      `INSERT INTO payment_escrow_events (payment_id, state, trace_id, metadata)
       VALUES ($1, 'HOLD', $2, $3::jsonb)
       ON CONFLICT (payment_id) WHERE (state = 'HOLD') DO NOTHING`,
      [String(paymentId), traceId, JSON.stringify(holdMeta)],
    );
  }

  await applyJobCheckoutSideEffects(client, { paymentId, jobId });

  const domainEvents = [
    {
      type: 'job.payment.confirmed',
      idempotency_key: String(paymentId),
      payload: {
        job_id: jobId,
        payment_id: paymentId,
        amount_minor: amountMinor,
        currency,
        escrow_status: 'HELD',
        ledger_entry_id: ledgerEntry.id,
        trace_id: traceId,
      },
      occurred_at: new Date().toISOString(),
    },
  ];

  return { ledger: ledgerEntry, domainEvents };
}

export const jobCheckoutHandler = { validate, execute };
