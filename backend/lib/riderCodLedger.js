/**
 * Rider COD (cash on delivery) ledger — PROVISIONAL (awaiting business sign-off).
 *
 * Design (per Opus review):
 *   - Money movements recorded in ledger_entries (double-entry, append-only,
 *     idempotency_key + transaction_group_id). No new *_events table.
 *   - payment_ledger_audit gets COD audit rows (event_type added in 267,
 *     gateway='wallet' which is allowed by the gateway CHECK).
 *   - Deposit-hold / tier-cap uses commerce.rider_cod_accounts +
 *     commerce.rider_cod_holds with the escrow conditional-UPDATE guard
 *     (WHERE status='held' / WHERE outstanding + x <= limit) and rowCount checks.
 *   - Reconciliation reuses reconciliation_runs / reconciliation_lines /
 *     financial_audit_log.
 *
 * Amounts: state tables use *_micro (satang, 1 THB = 100 micro); ledger_entries
 * and payment_ledger_audit use THB NUMERIC(18,2).
 */
import { randomUUID } from 'crypto';

function newId(prefix = 'L-cod') {
  return `${prefix}-${randomUUID().replace(/-/g, '').slice(0, 18)}`;
}

function microToThb(micro) {
  return Number((Number(micro || 0) / 100).toFixed(2));
}

/**
 * COD outstanding cap per tier — PROVISIONAL, awaiting business sign-off.
 * Platinum is capped (NOT unlimited) at 20,000 THB per Opus review.
 */
export function codTierLimitMicro(grade) {
  const g = String(grade || '').toLowerCase();
  switch (g) {
    case 'platinum':
      return Number(process.env.RIDER_COD_LIMIT_PLATINUM_MICRO ?? 2_000_000); // 20,000 THB (provisional)
    case 'gold':
      return Number(process.env.RIDER_COD_LIMIT_GOLD_MICRO ?? 1_000_000); // 10,000 THB
    case 'silver':
      return Number(process.env.RIDER_COD_LIMIT_SILVER_MICRO ?? 500_000); // 5,000 THB
    default:
      return Number(process.env.RIDER_COD_LIMIT_BRONZE_MICRO ?? 200_000); // 2,000 THB (new/bronze)
  }
}

async function insertLedgerLeg(client, p) {
  await client.query(
    `INSERT INTO ledger_entries
       (idempotency_key, transaction_group_id, event_type, direction, amount, currency,
        user_id, system_account_code, description, gateway, payment_id, metadata)
     VALUES ($1,$2,$3,$4,$5,'THB',$6,$7,$8,'rider_cod',$9,$10::jsonb)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [
      p.idem,
      p.tgid,
      p.event,
      p.direction,
      p.amount,
      p.userId || null,
      p.systemAccount || null,
      p.desc || '',
      p.jobId || null,
      JSON.stringify(p.metadata || {}),
    ],
  );
}

async function insertCodAudit(client, p) {
  const id = newId('L-cod');
  await client.query(
    `INSERT INTO payment_ledger_audit
       (id, event_type, payment_id, gateway, job_id, amount, currency, status,
        bill_no, transaction_no, user_id, metadata)
     VALUES ($1,$2,$3,'wallet',$4,$5,'THB',$6,$7,$8,$9,$10::jsonb)`,
    [
      id,
      p.event,
      String(p.jobId || 'unknown'),
      String(p.jobId || 'unknown'),
      microToThb(p.amountMicro),
      p.status || 'completed',
      `COD-${p.jobId}`,
      `COD-${p.event}-${p.jobId}-${Date.now()}`,
      p.userId || null,
      JSON.stringify({
        rider_id: p.riderId,
        order_id: p.orderId || null,
        transaction_group_id: p.tgid,
        provisional: true,
        ...(p.extra || {}),
      }),
    ],
  );
}

/**
 * Reserve COD against the rider's tier cap when a COD job is accepted.
 * Atomic double-spend/cap guard via conditional UPDATE (rowCount checked).
 * Idempotent per job_id.
 */
export async function assignCodHold(pool, { riderId, userId, jobId, orderId, amountMicro, grade }) {
  const amount = Math.max(0, Number(amountMicro || 0));
  const limit = codTierLimitMicro(grade);
  if (amount > limit) {
    return { ok: false, code: 'cod_limit_exceeded', limit_micro: limit, amount_micro: amount };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT * FROM commerce.rider_cod_holds WHERE job_id = $1 FOR UPDATE`,
      [jobId],
    );
    if (existing.rows[0]) {
      await client.query('COMMIT');
      return { ok: true, idempotent: true, hold: existing.rows[0] };
    }

    const tgid = randomUUID();
    const holdIns = await client.query(
      `INSERT INTO commerce.rider_cod_holds
         (rider_id, user_id, job_id, order_id, amount_micro, status, tier_limit_micro, transaction_group_id)
       VALUES ($1,$2,$3,$4,$5,'held',$6,$7)
       ON CONFLICT (job_id) DO NOTHING
       RETURNING *`,
      [riderId, userId || null, jobId, orderId || null, amount, limit, tgid],
    );
    if (!holdIns.rows[0]) {
      // Concurrent insert won the race — return idempotently.
      await client.query('ROLLBACK');
      const again = await pool.query(
        `SELECT * FROM commerce.rider_cod_holds WHERE job_id = $1`,
        [jobId],
      );
      return { ok: true, idempotent: true, hold: again.rows[0] || null };
    }

    // Conditional cap guard: only accumulate if it keeps outstanding <= limit.
    const acct = await client.query(
      `INSERT INTO commerce.rider_cod_accounts (rider_id, user_id, outstanding_micro, limit_micro, tier)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (rider_id) DO UPDATE
         SET outstanding_micro = commerce.rider_cod_accounts.outstanding_micro + EXCLUDED.outstanding_micro,
             user_id = COALESCE(commerce.rider_cod_accounts.user_id, EXCLUDED.user_id),
             limit_micro = EXCLUDED.limit_micro,
             tier = EXCLUDED.tier,
             updated_at = NOW()
         WHERE commerce.rider_cod_accounts.status = 'active'
           AND commerce.rider_cod_accounts.outstanding_micro + EXCLUDED.outstanding_micro
               <= EXCLUDED.limit_micro
       RETURNING *`,
      [riderId, userId || null, amount, limit, grade || null],
    );
    if (!acct.rows[0]) {
      await client.query('ROLLBACK');
      return { ok: false, code: 'cod_limit_exceeded', limit_micro: limit, amount_micro: amount };
    }

    await insertCodAudit(client, {
      event: 'rider_cod_deposit_hold',
      riderId,
      userId,
      jobId,
      orderId,
      amountMicro: amount,
      status: 'pending',
      tgid,
    });

    await client.query('COMMIT');
    return { ok: true, hold: holdIns.rows[0], account: acct.rows[0] };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Rider collected cash from the customer at delivery. */
export async function markCodCollected(pool, { jobId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const upd = await client.query(
      `UPDATE commerce.rider_cod_holds
          SET status = 'collected', collected_at = NOW(), updated_at = NOW()
        WHERE job_id = $1 AND status = 'held'
        RETURNING *`,
      [jobId],
    );
    if (!upd.rows[0]) {
      await client.query('ROLLBACK');
      const cur = await pool.query(
        `SELECT * FROM commerce.rider_cod_holds WHERE job_id = $1`,
        [jobId],
      );
      if (cur.rows[0] && ['collected', 'deposited'].includes(cur.rows[0].status)) {
        return { ok: true, idempotent: true, hold: cur.rows[0] };
      }
      return { ok: false, code: 'cod_not_held' };
    }

    const hold = upd.rows[0];
    const tgid = hold.transaction_group_id || randomUUID();
    const amtThb = microToThb(hold.amount_micro);

    await insertLedgerLeg(client, {
      tgid,
      event: 'rider_cod_collected',
      direction: 'debit',
      amount: amtThb,
      systemAccount: 'CUSTOMER_COD_RECEIVABLE',
      userId: hold.user_id,
      idem: `cod-collected-${jobId}-d`,
      desc: `COD collected job ${jobId}`,
      jobId,
      metadata: { rider_id: hold.rider_id, order_id: hold.order_id, leg: 'receivable_clear' },
    });
    await insertLedgerLeg(client, {
      tgid,
      event: 'rider_cod_collected',
      direction: 'credit',
      amount: amtThb,
      systemAccount: 'RIDER_COD_CASH',
      userId: hold.user_id,
      idem: `cod-collected-${jobId}-c`,
      desc: `COD cash in rider hand job ${jobId}`,
      jobId,
      metadata: { rider_id: hold.rider_id, order_id: hold.order_id, leg: 'cash_in_hand' },
    });
    await insertCodAudit(client, {
      event: 'rider_cod_collected',
      riderId: hold.rider_id,
      userId: hold.user_id,
      jobId,
      orderId: hold.order_id,
      amountMicro: hold.amount_micro,
      status: 'completed',
      tgid,
    });

    await client.query('COMMIT');
    return { ok: true, hold };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Rider remitted the COD cash to the platform (slip / hub / wallet). */
export async function markCodDeposited(pool, { jobId, method, reference }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const upd = await client.query(
      `UPDATE commerce.rider_cod_holds
          SET status = 'deposited', deposited_at = NOW(), updated_at = NOW()
        WHERE job_id = $1 AND status IN ('held', 'collected')
        RETURNING *`,
      [jobId],
    );
    if (!upd.rows[0]) {
      await client.query('ROLLBACK');
      const cur = await pool.query(
        `SELECT * FROM commerce.rider_cod_holds WHERE job_id = $1`,
        [jobId],
      );
      if (cur.rows[0] && cur.rows[0].status === 'deposited') {
        return { ok: true, idempotent: true, hold: cur.rows[0] };
      }
      return { ok: false, code: 'cod_not_collectible' };
    }

    const hold = upd.rows[0];

    // Free the outstanding reservation.
    await client.query(
      `UPDATE commerce.rider_cod_accounts
          SET outstanding_micro = GREATEST(0, outstanding_micro - $2), updated_at = NOW()
        WHERE rider_id = $1`,
      [hold.rider_id, hold.amount_micro],
    );

    const tgid = hold.transaction_group_id || randomUUID();
    const amtThb = microToThb(hold.amount_micro);

    await insertLedgerLeg(client, {
      tgid,
      event: 'rider_cod_deposited',
      direction: 'debit',
      amount: amtThb,
      systemAccount: 'RIDER_COD_CASH',
      userId: hold.user_id,
      idem: `cod-deposited-${jobId}-d`,
      desc: `COD remitted by rider job ${jobId}`,
      jobId,
      metadata: { rider_id: hold.rider_id, order_id: hold.order_id, method: method || null, reference: reference || null },
    });
    await insertLedgerLeg(client, {
      tgid,
      event: 'rider_cod_deposited',
      direction: 'credit',
      amount: amtThb,
      systemAccount: 'PLATFORM_COD_SETTLEMENT',
      userId: hold.user_id,
      idem: `cod-deposited-${jobId}-c`,
      desc: `COD settled to platform job ${jobId}`,
      jobId,
      metadata: { rider_id: hold.rider_id, order_id: hold.order_id, method: method || null },
    });
    await insertCodAudit(client, {
      event: 'rider_cod_deposited',
      riderId: hold.rider_id,
      userId: hold.user_id,
      jobId,
      orderId: hold.order_id,
      amountMicro: hold.amount_micro,
      status: 'completed',
      tgid,
      extra: { method: method || null, reference: reference || null },
    });

    await client.query('COMMIT');
    return { ok: true, hold };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Free a reservation without remittance (job cancelled before pickup). */
export async function releaseCodHold(pool, { jobId, reason }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const upd = await client.query(
      `UPDATE commerce.rider_cod_holds
          SET status = 'released', updated_at = NOW()
        WHERE job_id = $1 AND status = 'held'
        RETURNING *`,
      [jobId],
    );
    if (!upd.rows[0]) {
      await client.query('ROLLBACK');
      return { ok: false, code: 'cod_not_releasable' };
    }
    const hold = upd.rows[0];
    await client.query(
      `UPDATE commerce.rider_cod_accounts
          SET outstanding_micro = GREATEST(0, outstanding_micro - $2), updated_at = NOW()
        WHERE rider_id = $1`,
      [hold.rider_id, hold.amount_micro],
    );
    await insertCodAudit(client, {
      event: 'rider_cod_deposit_release',
      riderId: hold.rider_id,
      userId: hold.user_id,
      jobId,
      orderId: hold.order_id,
      amountMicro: hold.amount_micro,
      status: 'completed',
      tgid: hold.transaction_group_id,
      extra: { reason: reason || null },
    });
    await client.query('COMMIT');
    return { ok: true, hold };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function getRiderCodStatus(pool, riderId) {
  const acctQ = await pool.query(
    `SELECT * FROM commerce.rider_cod_accounts WHERE rider_id = $1`,
    [riderId],
  );
  const holdsQ = await pool.query(
    `SELECT id, job_id, order_id, amount_micro, status, created_at, collected_at
       FROM commerce.rider_cod_holds
      WHERE rider_id = $1 AND status IN ('held', 'collected')
      ORDER BY created_at ASC`,
    [riderId],
  );
  const acct = acctQ.rows[0] || null;
  return {
    rider_id: riderId,
    outstanding_micro: Number(acct?.outstanding_micro || 0),
    limit_micro: Number(acct?.limit_micro || codTierLimitMicro(acct?.tier || '')),
    available_cod_limit_micro: Math.max(
      0,
      Number(acct?.limit_micro || codTierLimitMicro(acct?.tier || '')) -
        Number(acct?.outstanding_micro || 0),
    ),
    status: acct?.status || 'active',
    tier: acct?.tier || null,
    open_holds: holdsQ.rows || [],
    /** OpenAPI alias */
    cod_outstanding: Number(acct?.outstanding_micro || 0) / 100,
    cod_limit: Number(acct?.limit_micro || codTierLimitMicro(acct?.tier || '')) / 100,
    available_cod_limit:
      Math.max(
        0,
        Number(acct?.limit_micro || codTierLimitMicro(acct?.tier || '')) -
          Number(acct?.outstanding_micro || 0),
      ) / 100,
    pending_deposit_micro: (holdsQ.rows || [])
      .filter((h) => h.status === 'collected')
      .reduce((s, h) => s + Number(h.amount_micro || 0), 0),
    provisional: true,
  };
}

/**
 * Reconciliation — reuses reconciliation_runs / reconciliation_lines /
 * financial_audit_log. Compares COD collected vs deposited vs still-outstanding
 * and flags late remittances.
 */
export async function runCodReconciliation(pool, { hoursBack = 24, lateHours = 24 } = {}) {
  const runQ = await pool.query(
    `INSERT INTO reconciliation_runs (run_date, gateway, status)
     VALUES (CURRENT_DATE, 'rider_cod', 'pending')
     RETURNING id`,
  );
  const runId = runQ.rows[0]?.id;

  const sumQ = await pool.query(
    `SELECT
        COALESCE(SUM(amount) FILTER (WHERE event_type = 'rider_cod_collected' AND direction = 'credit'), 0) AS collected,
        COALESCE(SUM(amount) FILTER (WHERE event_type = 'rider_cod_deposited' AND direction = 'credit'), 0) AS deposited
       FROM ledger_entries
      WHERE gateway = 'rider_cod'
        AND created_at >= NOW() - make_interval(hours => $1)`,
    [hoursBack],
  );
  const collected = Number(sumQ.rows[0]?.collected || 0);
  const deposited = Number(sumQ.rows[0]?.deposited || 0);

  const outstandingQ = await pool.query(
    `SELECT COALESCE(SUM(outstanding_micro), 0)::bigint AS out_micro
       FROM commerce.rider_cod_accounts`,
  );
  const outstandingThb = microToThb(outstandingQ.rows[0]?.out_micro || 0);

  // Late remittances: collected but not deposited beyond the SLA window.
  const lateQ = await pool.query(
    `SELECT rider_id, job_id, amount_micro, collected_at
       FROM commerce.rider_cod_holds
      WHERE status = 'collected'
        AND collected_at IS NOT NULL
        AND collected_at < NOW() - make_interval(hours => $1)
      ORDER BY collected_at ASC`,
    [lateHours],
  );

  let mismatchCount = 0;
  for (const row of lateQ.rows || []) {
    mismatchCount += 1;
    if (runId) {
      await pool.query(
        `INSERT INTO reconciliation_lines
           (run_id, status, internal_amount, external_ref, mismatch_reason)
         VALUES ($1, 'missing_external', $2, $3, $4)`,
        [
          runId,
          microToThb(row.amount_micro),
          `job:${row.job_id}`,
          `late_cod_remittance rider=${row.rider_id} collected_at=${row.collected_at?.toISOString?.() || row.collected_at}`,
        ],
      );
    }
  }

  // Expected vs actual outstanding (collected - deposited should equal current outstanding reservations).
  const expectedOutstanding = Number((collected - deposited).toFixed(2));
  const epsilon = Number(process.env.RIDER_COD_RECON_EPSILON_THB ?? 1);
  const balanceMismatch = Math.abs(expectedOutstanding - outstandingThb) > epsilon;
  if (balanceMismatch) {
    mismatchCount += 1;
    if (runId) {
      await pool.query(
        `INSERT INTO reconciliation_lines
           (run_id, status, internal_amount, external_amount, mismatch_reason)
         VALUES ($1, 'mismatch', $2, $3, $4)`,
        [
          runId,
          expectedOutstanding,
          outstandingThb,
          `cod_balance_drift expected=${expectedOutstanding} actual_outstanding=${outstandingThb}`,
        ],
      );
    }
  }

  const status = mismatchCount > 0 ? 'mismatch_found' : 'matched';
  if (runId) {
    await pool.query(
      `UPDATE reconciliation_runs
          SET status = $2, total_internal_amount = $3, total_external_amount = $4,
              mismatch_count = $5, completed_at = NOW()
        WHERE id = $1`,
      [runId, status, collected, deposited, mismatchCount],
    );
  }

  await pool.query(
    `INSERT INTO financial_audit_log
       (actor_type, actor_id, action, entity_type, entity_id, reason, state_after, correlation_id)
     VALUES ('system', 'cod_recon_cron', 'cod_reconciliation', 'reconciliation_run', $1, $2, $3::jsonb, $1)`,
    [
      String(runId || 'unknown'),
      status,
      JSON.stringify({
        collected,
        deposited,
        outstanding_thb: outstandingThb,
        expected_outstanding: expectedOutstanding,
        mismatch_count: mismatchCount,
        provisional: true,
      }),
    ],
  ).catch(() => {});

  return { run_id: runId, status, collected, deposited, outstanding_thb: outstandingThb, mismatch_count: mismatchCount };
}
