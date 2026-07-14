/**
 * Admin-only per-job escrow release (wraps same rules as POST /api/payments/release).
 */
import { emitCommerceEvent } from './userCommerceEvents.js';
import { postProviderWhtForEarning } from './providerWhtService.js';

function round2(n) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.round(x * 100) / 100 : 0;
}

async function resolveUserId(pool, userId) {
  const raw = String(userId || '').trim();
  if (!raw) return null;
  const r = await pool.query(
    `SELECT id FROM users WHERE id::text = $1 OR firebase_uid = $1 LIMIT 1`,
    [raw],
  );
  return r.rows?.[0]?.id || raw;
}

async function isWalletFrozen(pool, userId) {
  const uid = await resolveUserId(pool, userId);
  const r = await pool.query(
    `SELECT wallet_frozen, account_status FROM users WHERE id::text = $1 LIMIT 1`,
    [String(uid)],
  );
  const row = r.rows?.[0];
  if (!row) return false;
  const st = String(row.account_status || '').toLowerCase();
  return !!row.wallet_frozen || st === 'suspended' || st === 'banned';
}

function parsePaymentDetails(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} jobId
 * @param {{
 *   skipTimer?: boolean,
 *   forceOpenDispute?: boolean,
 *   actorId?: string,
 *   actorEmail?: string,
 * }} [opts]
 */
export async function adminReleaseJobEscrow(pool, jobId, opts = {}) {
  const jid = String(jobId || '').trim();
  if (!jid) return { ok: false, status: 400, error: 'job_id required' };

  const jobRes = await pool.query(
    `SELECT j.*, u.full_name AS created_by_name
     FROM jobs j
     LEFT JOIN users u ON u.id = j.created_by
     WHERE j.id::text = $1
     LIMIT 1`,
    [jid],
  );
  let job = jobRes.rows?.[0];
  if (!job) {
    const adv = await pool.query(
      `SELECT aj.*, u.full_name AS created_by_name
       FROM advance_jobs aj
       LEFT JOIN users u ON u.id = aj.employer_id
       WHERE aj.id::text = $1 LIMIT 1`,
      [jid],
    );
    job = adv.rows?.[0];
    if (!job) return { ok: false, status: 404, error: 'Job not found' };
    return {
      ok: false,
      status: 501,
      error: 'Advance job escrow release — ใช้หน้า Advance Jobs / milestone release',
    };
  }

  const createdByName = String(job.created_by_name || '');
  const title = String(job.title || '');
  const isDemoJob = /demo employer|apple review/i.test(createdByName)
    || /apple review|demo/i.test(title)
    || /job_apple_demo|_demo_/i.test(jid);

  const disputeStatus = parsePaymentDetails(job.payment_details).dispute_status
    || job.dispute_status;

  if (!opts.forceOpenDispute) {
    if (disputeStatus === 'pending') {
      return {
        ok: false,
        status: 403,
        error: 'payment_locked_by_dispute',
        message: 'มี dispute เปิดอยู่ — ใช้ force=true หลัง resolve แล้วเท่านั้น',
      };
    }
    const disputeCheck = await pool.query(
      `SELECT id FROM job_disputes WHERE job_id = $1 AND status = 'open' LIMIT 1`,
      [jid],
    ).catch(() => ({ rows: [] }));
    if (disputeCheck.rows?.length) {
      return {
        ok: false,
        status: 403,
        error: 'payment_locked_by_dispute',
        message: 'มี open dispute record — resolve ก่อน หรือส่ง force=true',
      };
    }
  }

  const paymentDetails = parsePaymentDetails(job.payment_details);
  if (paymentDetails.released_status === 'released') {
    return { ok: false, status: 400, error: 'already_released', message: 'ปล่อย escrow แล้ว' };
  }

  if (!opts.skipTimer && !isDemoJob) {
    const releaseAfterMs = paymentDetails.provider_release_after
      ? new Date(paymentDetails.provider_release_after).getTime()
      : NaN;
    if (!Number.isNaN(releaseAfterMs) && releaseAfterMs > Date.now()) {
      const retryAfterSeconds = Math.ceil((releaseAfterMs - Date.now()) / 1000);
      return {
        ok: false,
        status: 400,
        error: 'release_too_early',
        message: `รออีก ${retryAfterSeconds}s (กันเงิน 5 นาที)`,
        retry_after_seconds: retryAfterSeconds,
      };
    }
  }

  const providerReceive = Number(paymentDetails.provider_receive);
  const providerIdRaw = job.accepted_by;
  if (!providerIdRaw) {
    return { ok: false, status: 400, error: 'no_provider', message: 'งานยังไม่มี accepted_by' };
  }
  if (!Number.isFinite(providerReceive) || providerReceive <= 0) {
    return { ok: false, status: 400, error: 'invalid_amount', message: 'provider_receive ไม่ถูกต้อง' };
  }

  const providerId = await resolveUserId(pool, providerIdRaw);
  if (await isWalletFrozen(pool, providerId)) {
    return { ok: false, status: 403, error: 'provider_wallet_frozen' };
  }

  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    const updateJobResult = await dbClient.query(
      `UPDATE jobs SET
         payment_details = jsonb_set(
           COALESCE(payment_details, '{}'::jsonb),
           '{released_status}',
           '"released"'
         ),
         insurance_coverage_status = CASE
           WHEN COALESCE(has_insurance, (payment_details->>'has_insurance')::boolean) = true
           THEN 'terminated' ELSE insurance_coverage_status END,
         updated_at = NOW()
       WHERE id::text = $1
         AND (COALESCE(payment_details->>'released_status', '') IN ('', 'pending'))
       RETURNING id`,
      [jid],
    );
    if (!updateJobResult.rows?.length) {
      await dbClient.query('ROLLBACK');
      return {
        ok: false,
        status: 409,
        error: 'already_released',
        message: 'Concurrent release — อาจปล่อยไปแล้ว',
      };
    }

    const provRelease = await dbClient.query(
      `UPDATE users SET
         wallet_pending = GREATEST(0, COALESCE(wallet_pending, 0) - $1),
         wallet_balance = COALESCE(wallet_balance, 0) + $1,
         updated_at = NOW()
       WHERE id::text = $2 OR firebase_uid = $2
       RETURNING id, wallet_pending`,
      [providerReceive, String(providerIdRaw)],
    );
    if (!provRelease.rows?.length) {
      await dbClient.query('ROLLBACK');
      return { ok: false, status: 500, error: 'provider_release_failed' };
    }

    const providerActualId = provRelease.rows[0].id;
    const providerLedgerRow = await dbClient.query(
      `SELECT id, metadata FROM payment_ledger_audit
       WHERE provider_id::text = $1 AND job_id::text = $2
         AND event_type = 'escrow_held' AND metadata->>'leg' = 'provider_net'
       ORDER BY created_at DESC LIMIT 1`,
      [String(providerActualId), jid],
    ).catch(() => ({ rows: [] }));

    const providerLedger = providerLedgerRow.rows?.[0] || null;
    const whtSourceId = providerLedger?.id || `admin-job-release-${jid}-${providerActualId}`;
    const jobFeeForWht = round2(
      Number(paymentDetails.job_fee || paymentDetails.gross_earnings || providerReceive) || providerReceive,
    );
    const platformFeeForWht = round2(
      Number(paymentDetails.fee_amount || 0)
      || Math.max(0, jobFeeForWht - providerReceive),
    );

    const whtPosting = await postProviderWhtForEarning(dbClient, {
      sourceEventId: whtSourceId,
      sourceEventType: 'job_provider_release',
      providerUserId: providerActualId,
      grossIncomeAmount: jobFeeForWht,
      platformFeeAmount: platformFeeForWht,
      sourcePaymentId: jid,
      sourceJobId: jid,
      actorId: opts.actorEmail || opts.actorId || 'admin_release',
      applyBalanceMutation: true,
    });

    const newPending = parseFloat(provRelease.rows[0]?.wallet_pending || 0);
    if (newPending > 0 && newPending < 0.01) {
      await dbClient.query(
        `UPDATE users SET wallet_pending = 0, updated_at = NOW() WHERE id::text = $1 OR firebase_uid = $1`,
        [String(providerIdRaw)],
      );
    } else if (newPending < 0) {
      await dbClient.query('ROLLBACK');
      return { ok: false, status: 500, error: 'pending_overdrawn' };
    }

    await dbClient.query(
      `UPDATE transactions SET status = 'completed', released_at = NOW()
       WHERE related_job_id = $1
         AND (user_id::text = $2 OR user_id::text = $3)
         AND type = 'income' AND status = 'pending_release'`,
      [jid, String(providerId), String(providerIdRaw)],
    );

    await dbClient.query('COMMIT');

    void emitCommerceEvent(pool, {
      userId: String(providerActualId),
      eventType: 'escrow_released',
      category: 'job',
      amount: providerReceive,
      jobId: jid,
      sourceTable: 'jobs',
      sourceId: `${jid}:admin_released:${providerActualId}`,
      metadata: {
        stage: 'release',
        admin: true,
        wht: Number(whtPosting?.withheldAmount || 0),
      },
    }).catch(() => { });

    return {
      ok: true,
      status: 200,
      job_id: jid,
      amount: providerReceive,
      wht_withheld: Number(whtPosting?.withheldAmount || 0),
      net_available: round2(providerReceive - Number(whtPosting?.withheldAmount || 0)),
      provider_id: providerActualId,
    };
  } catch (e) {
    await dbClient.query('ROLLBACK').catch(() => { });
    throw e;
  } finally {
    dbClient.release();
  }
}

/**
 * Preview whether admin can release escrow for a job.
 * @param {import('pg').Pool} pool
 */
export async function previewAdminJobEscrowRelease(pool, jobId) {
  const jid = String(jobId || '').trim();
  const jobRes = await pool.query(
    `SELECT id, title, status, accepted_by, payment_details
     FROM jobs WHERE id::text = $1 LIMIT 1`,
    [jid],
  );
  const job = jobRes.rows?.[0];
  if (!job) return { eligible: false, reason: 'job_not_found' };

  const pd = parsePaymentDetails(job.payment_details);
  if (pd.released_status === 'released') {
    return { eligible: false, reason: 'already_released', job_status: job.status };
  }
  if (!job.accepted_by) {
    return { eligible: false, reason: 'no_provider', job_status: job.status };
  }
  const openDispute = await pool.query(
    `SELECT id FROM job_disputes WHERE job_id = $1 AND status = 'open' LIMIT 1`,
    [jid],
  ).catch(() => ({ rows: [] }));

  return {
    eligible: !openDispute.rows?.length && Number(pd.provider_receive) > 0,
    reason: openDispute.rows?.length ? 'open_dispute' : null,
    job_status: job.status,
    provider_receive: Number(pd.provider_receive) || null,
    released_status: pd.released_status || 'pending',
    has_escrow: pd.escrow_held === true || pd.released_status === 'pending',
  };
}
