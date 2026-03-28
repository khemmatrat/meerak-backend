/**
 * Self-healing settlement: compare Jobs (front) vs gateway_transactions (back) 1:1 in minor units.
 */
import { sendLineNotify } from './alertNotifier.js';

function jobAmountToMinor(paymentDetails) {
  const pd =
    typeof paymentDetails === 'string' ? JSON.parse(paymentDetails || '{}') : paymentDetails || {};
  const raw = pd.amount ?? pd.total ?? pd.finalPrice ?? 0;
  const thb = Number(raw);
  if (!Number.isFinite(thb)) return null;
  return Math.round(thb * 100);
}

/**
 * @param {import('pg').Pool} pool
 */
export async function runNightlyGatewayReconciliation(pool) {
  let mismatches = [];
  let checked = 0;
  try {
    const r = await pool.query(
      `SELECT id, job_id, amount_minor, status, metadata, locked_for_recon
       FROM gateway_transactions
       WHERE (job_id IS NOT NULL OR COALESCE(metadata->>'job_id','') <> '')
         AND status NOT IN ('FAILED', 'VOIDED', 'REFUNDED')`
    );
    for (const row of r.rows || []) {
      const jid = row.job_id || row.metadata?.job_id;
      if (!jid) continue;
      checked += 1;
      const job = await pool
        .query(`SELECT id, payment_status, payment_details FROM jobs WHERE id::text = $1 LIMIT 1`, [String(jid)])
        .catch(() => ({ rows: [] }));
      const j = job.rows?.[0];
      if (!j) {
        mismatches.push({ gatewayId: row.id, jobId: jid, issue: 'job_missing' });
        await pool
          .query(
            `UPDATE gateway_transactions SET locked_for_recon = TRUE, recon_alert_at = COALESCE(recon_alert_at, NOW()),
             metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb WHERE id = $1::uuid`,
            [row.id, JSON.stringify({ recon_issue: 'job_missing' })]
          )
          .catch(() => {});
        continue;
      }
      if (String(j.payment_status || '').toLowerCase() !== 'paid') continue;
      const jobMinor = jobAmountToMinor(j.payment_details);
      if (jobMinor == null) continue;
      const delta = Math.abs(jobMinor - Number(row.amount_minor || 0));
      if (delta > 0) {
        mismatches.push({
          gatewayId: row.id,
          jobId: jid,
          jobMinor,
          gatewayMinor: Number(row.amount_minor),
          deltaMinor: delta,
        });
        await pool.query(
          `UPDATE gateway_transactions
           SET locked_for_recon = TRUE,
               recon_alert_at = COALESCE(recon_alert_at, NOW()),
               metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
           WHERE id = $1::uuid`,
          [row.id, JSON.stringify({ recon_delta_minor: delta, recon_checked_at: new Date().toISOString() })]
        );
      }
    }

    const matched = Math.max(0, checked - mismatches.length);
    await pool.query(
      `INSERT INTO gateway_reconciliation_runs (matched_count, mismatch_count, locked_count, details_json)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [
        matched,
        mismatches.length,
        mismatches.length,
        JSON.stringify({ mismatches: mismatches.slice(0, 500) }),
      ]
    );

    if (mismatches.length > 0) {
      const msg =
        `🚨 [AQOND] Gateway Reconcile — พบความต่าง Job vs Gateway จำนวน ${mismatches.length} รายการ (ล็อกธุรกรรมแล้ว)\n` +
        mismatches
          .slice(0, 5)
          .map((m) => `· ${m.jobId} Δ ${m.deltaMinor != null ? m.deltaMinor + ' สต.' : m.issue}`)
          .join('\n');
      await sendLineNotify(msg).catch(() => {});
    }

    return { ok: true, checked, mismatches: mismatches.length };
  } catch (e) {
    if (e && e.code === '42P01') return { ok: false, error: 'tables_missing' };
    throw e;
  }
}
