/**
 * Async queue for PaySo wallet deposit webhooks (burst-safe).
 * Enable: PAYSO_WEBHOOK_ASYNC=1 in backend .env
 */
import crypto from 'crypto';
import { creditWalletDepositFromPayso } from './walletDepositHybrid.js';

const RETRY_SECONDS = [30, 120, 600, 3600];

function sha256(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

function isAsyncEnabled() {
  const v = String(process.env.PAYSO_WEBHOOK_ASYNC || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export { isAsyncEnabled };

/**
 * @param {import('pg').Pool} pool
 * @param {{ chargeId: string, userId: string, grossAmount: number, transactionNoSuffix: string, payload?: object, headers?: object, rawBody?: string }} job
 */
export async function enqueueWalletDepositWebhookJob(pool, job) {
  const chargeId = String(job.chargeId || '').trim();
  if (!chargeId) return { ok: false, error: 'missing_charge_id' };
  const payloadJson = job.payload && typeof job.payload === 'object' ? job.payload : {};
  const headersJson = job.headers && typeof job.headers === 'object' ? job.headers : {};
  const digest = sha256(job.rawBody || JSON.stringify(payloadJson));
  try {
    const r = await pool.query(
      `INSERT INTO wallet_deposit_webhook_jobs
         (provider, charge_id, user_id, payload_json, headers_json, payload_sha256, status, next_attempt_at)
       VALUES ('payso', $1, $2::uuid, $3::jsonb, $4::jsonb, $5, 'queued', NOW())
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        chargeId,
        job.userId || null,
        JSON.stringify({
          ...payloadJson,
          _credit: {
            grossAmount: Number(job.grossAmount),
            transactionNoSuffix: String(job.transactionNoSuffix || ''),
          },
        }),
        JSON.stringify(headersJson),
        digest,
      ],
    );
    if (r.rows?.[0]?.id) {
      return { ok: true, queued: true, job_id: r.rows[0].id };
    }
    const existing = await pool.query(
      `SELECT id FROM wallet_deposit_webhook_jobs
       WHERE provider = 'payso' AND charge_id = $1 AND status IN ('queued', 'processing')
       LIMIT 1`,
      [chargeId],
    );
    if (existing.rows?.[0]?.id) {
      return { ok: true, queued: false, duplicate: true, job_id: existing.rows[0].id };
    }
    return { ok: true, queued: false, duplicate: false };
  } catch (e) {
    if (String(e?.code) === '42P01') {
      return { ok: false, error: 'wallet_deposit_webhook_jobs_table_missing' };
    }
    throw e;
  }
}

async function markJobDone(pool, id) {
  await pool.query(
    `UPDATE wallet_deposit_webhook_jobs
     SET status = 'done', processed_at = NOW(), last_error = NULL, updated_at = NOW()
     WHERE id = $1::uuid`,
    [id],
  );
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ limit?: number }} [opts]
 */
export async function processWalletDepositWebhookJobs(pool, opts = {}) {
  const limit = Math.min(Math.max(parseInt(String(opts.limit || 20), 10) || 20, 1), 100);
  let processed = 0;
  let credited = 0;

  const claim = await pool.query(
    `UPDATE wallet_deposit_webhook_jobs j
     SET status = 'processing', updated_at = NOW(), attempt_count = attempt_count + 1
     WHERE j.id IN (
       SELECT id FROM wallet_deposit_webhook_jobs
       WHERE status = 'queued' AND next_attempt_at <= NOW()
       ORDER BY next_attempt_at ASC, created_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING j.id, j.charge_id, j.user_id, j.payload_json, j.attempt_count`,
    [limit],
  );

  for (const row of claim.rows || []) {
    processed += 1;
    const payload = row.payload_json && typeof row.payload_json === 'object' ? row.payload_json : {};
    const creditMeta = payload._credit || {};
    try {
      const creditedRes = await creditWalletDepositFromPayso(pool, {
        userId: row.user_id,
        chargeId: row.charge_id,
        grossAmount: Number(creditMeta.grossAmount || payload.total || payload.amount || 0),
        transactionNoSuffix: String(creditMeta.transactionNoSuffix || payload.transaction_id || Date.now()),
      });
      await markJobDone(pool, row.id);
      if (creditedRes && !creditedRes.duplicate) credited += 1;
    } catch (e) {
      const attempt = parseInt(row.attempt_count, 10) || 1;
      const delaySec = RETRY_SECONDS[Math.min(attempt - 1, RETRY_SECONDS.length - 1)] || 3600;
      const dead = attempt >= RETRY_SECONDS.length + 1;
      await pool.query(
        `UPDATE wallet_deposit_webhook_jobs
         SET status = $2,
             last_error = $3,
             next_attempt_at = NOW() + ($4::text || ' seconds')::interval,
             updated_at = NOW()
         WHERE id = $1::uuid`,
        [row.id, dead ? 'dead_letter' : 'queued', String(e?.message || e).slice(0, 2000), String(delaySec)],
      );
    }
  }

  return { processed, credited };
}

export function startWalletDepositWebhookWorker(pool) {
  if (!isAsyncEnabled()) return null;
  const intervalMs = Math.max(parseInt(process.env.PAYSO_WEBHOOK_WORKER_INTERVAL_MS || '3000', 10) || 3000, 1000);
  const tick = () => {
    processWalletDepositWebhookJobs(pool, {
      limit: parseInt(process.env.PAYSO_WEBHOOK_WORKER_BATCH || '25', 10) || 25,
    }).catch((e) => {
      if (String(e?.code) !== '42P01') {
        console.warn('[walletDepositWebhookQueue]', e?.message || e);
      }
    });
  };
  tick();
  return setInterval(tick, intervalMs);
}
