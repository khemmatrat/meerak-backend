/**
 * Task 11: Escrow release settlement (Match job checkout / ledger_entries + payment_escrow_events).
 *
 * Transitions: escrow held (ledger + HOLD event) -> escrow released (ledger ESCROW_RELEASED + RELEASED event + gateway settlement).
 * Invariants: baseline freeze — append-only ledger, idempotent keys, no SQL to missing tables, single DB transaction.
 */

import { logAdminAction } from './adminActionsLog.js';
import { regclassExists } from './jobBookingCheckoutSideEffects.js';
import { recordEscrowReleased } from './paymentBusinessActions/jobCheckoutHandler.js';

const AMOUNT_EPS_MINOR = 2;

function mkErr(message, code) {
  const e = new Error(String(message || 'escrow_release_failed'));
  e.code = String(code || 'ESCROW_RELEASE_FAILED');
  e.nonRetryable = true;
  return e;
}

/**
 * @param {import('pg').PoolClient} client
 * @param {string} paymentId
 */
async function loadGatewayRowOptional(client, paymentId) {
  if (!(await regclassExists(client, 'public.gateway_transactions'))) return null;
  const r = await client.query(
    `SELECT id, settlement_status, amount_minor, currency, client_reference_id, external_ref, status
     FROM gateway_transactions
     WHERE external_ref = $1 OR merchant_reference = $1 OR client_reference_id = $1
     ORDER BY updated_at DESC
     LIMIT 1
     FOR UPDATE`,
    [paymentId],
  );
  return r.rows?.[0] || null;
}

/**
 * @param {import('pg').PoolClient} client
 * @param {string} jobRef
 */
async function isJobExplicitlyDisputed(client, jobRef) {
  const ref = String(jobRef || '').trim();
  const bare = ref.replace(/^job_/i, '');
  const ids = [...new Set([ref, bare].filter(Boolean))];

  if (await regclassExists(client, 'public.advance_jobs')) {
    const a = await client.query(
      `SELECT status::text AS s FROM advance_jobs WHERE id::text = $1 OR id::text = $2 LIMIT 1`,
      [ids[0], ids[1] ?? ids[0]],
    );
    if (a.rows?.[0] && String(a.rows[0].s).toLowerCase() === 'disputed') return true;
  }
  if (await regclassExists(client, 'public.jobs')) {
    const j = await client.query(
      `SELECT lower(status::text) AS s FROM jobs WHERE id::text = $1 OR id::text = $2 LIMIT 1`,
      [ids[0], ids[1] ?? ids[0]],
    );
    if (j.rows?.[0] && String(j.rows[0].s) === 'disputed') return true;
  }
  return false;
}

/**
 * Resolve gateway payment id for Match escrow hold (ledger holds job id as user_id).
 *
 * @param {import('pg').PoolClient} client
 * @param {{ paymentId?: string|null, jobId?: string|null }} p
 * @returns {Promise<{ paymentId: string, jobRef: string, holdRow: object }>}
 */
export async function resolveMatchEscrowContext(client, p) {
  let paymentId = p.paymentId != null ? String(p.paymentId).trim() : '';
  const jobHint = p.jobId != null ? String(p.jobId).trim() : '';

  if (!paymentId && !jobHint) {
    throw mkErr('payment_id or job_id required', 'ESCROW_RELEASE_INPUT_MISSING');
  }

  if (!paymentId && jobHint) {
    const bare = jobHint.replace(/^job_/i, '');
    const r = await client.query(
      `SELECT payment_id, user_id
       FROM ledger_entries
       WHERE event_type = 'ESCROW_HOLD'
         AND (user_id = $1 OR user_id = $2 OR payment_id = $1 OR payment_id = $2)
       ORDER BY id ASC
       LIMIT 1`,
      [jobHint, bare],
    );
    const row = r.rows?.[0];
    if (!row) {
      throw mkErr('No ESCROW_HOLD ledger row for this job reference', 'ESCROW_HOLD_NOT_FOUND');
    }
    paymentId = String(row.payment_id || '').trim();
    if (!paymentId) throw mkErr('ESCROW_HOLD row missing payment_id', 'ESCROW_HOLD_INVALID');
    const jobRef = String(row.user_id || '').trim() || jobHint;
    const hold = await client.query(
      `SELECT *
       FROM ledger_entries
       WHERE payment_id = $1 AND event_type = 'ESCROW_HOLD'
       ORDER BY id ASC
       LIMIT 1`,
      [paymentId],
    );
    return { paymentId, jobRef, holdRow: hold.rows[0] };
  }

  const hold = await client.query(
    `SELECT *
     FROM ledger_entries
     WHERE payment_id = $1 AND event_type = 'ESCROW_HOLD'
     ORDER BY id ASC
     LIMIT 1`,
    [paymentId],
  );
  if (!hold.rows?.[0]) {
    throw mkErr('No ESCROW_HOLD ledger row for this payment_id', 'ESCROW_HOLD_NOT_FOUND');
  }
  const jobRef = String(hold.rows[0].user_id || jobHint || '').trim();
  if (!jobRef) throw mkErr('ESCROW_HOLD row missing job reference (user_id)', 'ESCROW_JOB_REF_MISSING');
  return { paymentId, jobRef, holdRow: hold.rows[0] };
}

/**
 * @param {import('pg').PoolClient} client
 * @param {{
 *   paymentId?: string|null,
 *   jobId?: string|null,
 *   amountMinorExpected?: number|null,
 *   actor: string,
 *   reason: string,
 *   traceId?: string|null,
 *   skipJobCompletionGuard?: boolean,
 * }} input
 */
export async function executeEscrowReleaseSettlement(client, input) {
  const actor = String(input?.actor || '').trim() || 'system';
  const reason = String(input?.reason || '').trim();
  const traceId = input?.traceId != null ? String(input.traceId) : null;
  const skipGuard = input?.skipJobCompletionGuard === true;

  if (!(await regclassExists(client, 'public.ledger_entries'))) {
    throw mkErr('ledger_entries not available', 'LEDGER_SCHEMA_MISSING');
  }
  if (!(await regclassExists(client, 'public.payment_escrow_events'))) {
    throw mkErr('payment_escrow_events not available', 'ESCROW_EVENTS_SCHEMA_MISSING');
  }

  const ctx = await resolveMatchEscrowContext(client, {
    paymentId: input.paymentId,
    jobId: input.jobId,
  });
  const { paymentId, jobRef, holdRow } = ctx;

  // Serialize per payment so concurrent admin calls cannot double-insert (unique index)
  // or race past idempotency checks.
  await client.query(
    `SELECT pg_advisory_xact_lock(
       hashtext('meerak_escrow_release_v1'::text),
       hashtext($1::text)
     )`,
    [paymentId],
  );

  const releasedLedger = await client.query(
    `SELECT id
     FROM ledger_entries
     WHERE payment_id = $1 AND event_type = 'ESCROW_RELEASED'
     ORDER BY id ASC
     LIMIT 1`,
    [paymentId],
  );
  if (releasedLedger.rows?.length) {
    return {
      ok: true,
      idempotent: true,
      payment_id: paymentId,
      ledger_entry_id: releasedLedger.rows[0].id,
      reason: 'already_released_ledger',
    };
  }

  const releasedEv = await client.query(
    `SELECT id FROM payment_escrow_events
     WHERE payment_id = $1 AND state = 'RELEASED' LIMIT 1`,
    [paymentId],
  );
  if (releasedEv.rows?.length) {
    return {
      ok: true,
      idempotent: true,
      payment_id: paymentId,
      reason: 'already_released_escrow_event',
    };
  }

  if (await isJobExplicitlyDisputed(client, jobRef)) {
    throw mkErr('Job is disputed — escrow release blocked', 'ESCROW_RELEASE_DISPUTED');
  }

  const gw = await loadGatewayRowOptional(client, paymentId);
  if (gw) {
    const st = String(gw.settlement_status || '');
    if (st === 'ESCROW_DISPUTED') {
      throw mkErr('Gateway marks escrow disputed', 'ESCROW_RELEASE_DISPUTED');
    }
    if (st === 'ESCROW_RELEASED') {
      return { ok: true, idempotent: true, payment_id: paymentId, reason: 'gateway_already_escrow_released' };
    }
  }

  const paidRow = await client.query(
    `SELECT 1 FROM ledger_entries
     WHERE payment_id = $1 AND event_type = 'PAYMENT_COMPLETED'
     LIMIT 1`,
    [paymentId],
  );
  const hasPaymentCompleted = paidRow.rows?.length > 0;

  let paymentConfirmed = hasPaymentCompleted;
  if (gw) {
    const st = String(gw.settlement_status || '');
    if (['PAYMENT_CONFIRMED', 'ESCROW_HELD'].includes(st)) paymentConfirmed = true;
    if (st === 'NOT_APPLICABLE' || st === '') paymentConfirmed = paymentConfirmed || hasPaymentCompleted;
  }

  if (!paymentConfirmed) {
    throw mkErr('Payment not confirmed for escrow release (expect PAYMENT_COMPLETED ledger or gateway PAYMENT_CONFIRMED/ESCROW_HELD)', 'ESCROW_RELEASE_PAYMENT_NOT_CONFIRMED');
  }

  if (input.amountMinorExpected != null && Number.isFinite(Number(input.amountMinorExpected))) {
    const expect = Math.round(Number(input.amountMinorExpected));
    const holdMinor = Math.round(Number(holdRow.amount) * 100);
    if (Math.abs(expect - holdMinor) > AMOUNT_EPS_MINOR) {
      throw mkErr(
        `Amount mismatch: hold ${holdMinor} minor vs request ${expect}`,
        'ESCROW_RELEASE_AMOUNT_MISMATCH',
      );
    }
  }

  const holdAmount = Number(holdRow.amount);
  const currency = String(holdRow.currency || 'THB').toUpperCase();

  const ins = await client.query(
    `INSERT INTO ledger_entries (
       idempotency_key, transaction_group_id, payment_id, user_id, event_type, direction,
       amount, currency, description, trace_id, created_at
     )
     VALUES (
       $1, gen_random_uuid(), $2, $3, 'ESCROW_RELEASED', 'credit',
       $4::numeric, $5, $6, $7, NOW()
     )
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id`,
    [
      `escrow_released:${paymentId}`,
      paymentId,
      jobRef,
      holdAmount.toFixed(2),
      currency,
      `Escrow released for job ${jobRef}`,
      traceId,
    ],
  );

  let releaseLedgerId = ins.rows?.[0]?.id ?? null;
  if (!releaseLedgerId) {
    const ex = await client.query(
      `SELECT id FROM ledger_entries
       WHERE payment_id = $1 AND event_type = 'ESCROW_RELEASED'
       ORDER BY id ASC LIMIT 1`,
      [paymentId],
    );
    releaseLedgerId = ex.rows?.[0]?.id ?? null;
  }

  const holdMeta = {
    job_id: jobRef,
    source: 'payment_settlement_state_machine',
    release_reason: reason,
    actor,
  };

  await recordEscrowReleased(client, {
    paymentId,
    traceId,
    metadata: holdMeta,
    jobId: jobRef,
    skipJobCompletionGuard: skipGuard,
  });

  if (gw?.id) {
    await client.query(
      `UPDATE gateway_transactions
       SET settlement_status = 'ESCROW_RELEASED',
           status_version = status_version + 1,
           updated_at = NOW()
       WHERE id = $1::uuid
         AND settlement_status IS DISTINCT FROM 'ESCROW_RELEASED'`,
      [gw.id],
    );
  }

  await logAdminAction(client, {
    actionType: 'escrow_release_settlement',
    actor,
    paymentId,
    traceId,
    reason,
    metadata: {
      payment_id: paymentId,
      job_ref: jobRef,
      ledger_release_id: releaseLedgerId,
      skip_job_completion_guard: skipGuard,
    },
    afterSnapshot: {
      settlement: 'ESCROW_RELEASED',
      ledger_event_type: 'ESCROW_RELEASED',
    },
  });

  return {
    ok: true,
    idempotent: false,
    payment_id: paymentId,
    job_ref: jobRef,
    ledger_entry_id: releaseLedgerId,
    gateway_updated: !!gw?.id,
  };
}
