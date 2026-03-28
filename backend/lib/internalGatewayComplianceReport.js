/**
 * @fileoverview BOT-oriented monthly compliance snapshots (JSON + CSV) + DB row in gateway_settlement_reports.
 */
import crypto from 'crypto';
import { mkdirSync, writeFileSync, chmodSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Owner-only directory (POSIX). On Windows, ACLs are not set by Node; use NTFS permissions or deploy on Linux. */
const COMPLIANCE_DIR_MODE = 0o700;
const COMPLIANCE_FILE_MODE = 0o600;

/**
 * @param {string} dir
 */
function ensurePrivateComplianceDir(dir) {
  mkdirSync(dir, { recursive: true, mode: COMPLIANCE_DIR_MODE });
  if (process.platform !== 'win32') {
    try {
      chmodSync(dir, COMPLIANCE_DIR_MODE);
    } catch {
      /* ignore */
    }
  }
}

/**
 * @param {string} filePath
 * @param {string} data
 */
function writePrivateComplianceFile(filePath, data) {
  writeFileSync(filePath, data, { encoding: 'utf8', mode: COMPLIANCE_FILE_MODE, flag: 'w' });
  if (process.platform !== 'win32') {
    try {
      chmodSync(filePath, COMPLIANCE_FILE_MODE);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Previous calendar month in Asia/Bangkok and timestamptz bounds for gateway_transactions.created_at.
 * @param {import('pg').Pool} pool
 */
export async function getPreviousMonthBoundsBangkok(pool) {
  const r = await pool.query(`
    WITH now_bkk AS (
      SELECT timezone('Asia/Bangkok', NOW())::timestamp AS ts
    )
    SELECT
      date_trunc('month', ts - INTERVAL '1 month')::date AS period_start,
      (date_trunc('month', ts) - INTERVAL '1 day')::date AS period_end,
      (date_trunc('month', ts - INTERVAL '1 month') AT TIME ZONE 'Asia/Bangkok') AS range_start_ts,
      (date_trunc('month', ts) AT TIME ZONE 'Asia/Bangkok') AS range_end_ts
    FROM now_bkk
  `);
  const row = r.rows?.[0];
  if (!row) throw new Error('bounds_failed');
  return {
    periodStart: row.period_start,
    periodEnd: row.period_end,
    rangeStart: row.range_start_ts,
    rangeEnd: row.range_end_ts,
  };
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} year
 * @param {number} month 1–12
 */
export async function getCalendarMonthBoundsBangkok(pool, year, month) {
  const r = await pool.query(
    `
    WITH b AS (SELECT make_date($1::int, $2::int, 1)::date AS d1)
    SELECT
      d1 AS period_start,
      (d1 + INTERVAL '1 month' - INTERVAL '1 day')::date AS period_end,
      (d1::timestamp AT TIME ZONE 'Asia/Bangkok') AS range_start_ts,
      ((d1 + INTERVAL '1 month')::timestamp AT TIME ZONE 'Asia/Bangkok') AS range_end_ts
    FROM b
    `,
    [year, month]
  );
  const row = r.rows?.[0];
  if (!row) throw new Error('bounds_failed');
  return {
    periodStart: row.period_start,
    periodEnd: row.period_end,
    rangeStart: row.range_start_ts,
    rangeEnd: row.range_end_ts,
  };
}

/**
 * @param {import('pg').Pool} pool
 * @param {{
 *   periodStart: Date|string,
 *   periodEnd: Date|string,
 *   rangeStart: Date|string,
 *   rangeEnd: Date|string,
 * }} bounds
 * @param {{
 *   skipIfExists?: boolean,
 *   forceRegenerate?: boolean,
 *   manual?: { reason?: string | null, adminEmail?: string | null },
 * }} [opt]
 */
export async function generateComplianceSnapshot(pool, bounds, opt = {}) {
  const { rangeStart, rangeEnd, periodStart, periodEnd } = bounds;
  const skipIfExists = opt.skipIfExists !== false;
  const forceRegenerate = opt.forceRegenerate === true;
  const manual = opt.manual && typeof opt.manual === 'object' ? opt.manual : null;

  if (forceRegenerate) {
    await pool.query(
      `DELETE FROM gateway_settlement_reports
       WHERE report_period_start = $1::date AND report_period_end = $2::date`,
      [periodStart, periodEnd]
    );
  } else if (skipIfExists) {
    const dup = await pool.query(
      `SELECT id FROM gateway_settlement_reports
       WHERE report_period_start = $1::date AND report_period_end = $2::date
       LIMIT 1`,
      [periodStart, periodEnd]
    );
    if (dup.rows?.length) {
      return { skipped: true, reason: 'already_generated', existingId: dup.rows[0].id };
    }
  }

  const txAgg = await pool.query(
    `SELECT
       COUNT(*)::bigint AS total,
       COUNT(*) FILTER (WHERE status IN ('SETTLED','CAPTURED'))::bigint AS success_n,
       COUNT(*) FILTER (WHERE status = 'VOIDED')::bigint AS void_n,
       COUNT(*) FILTER (WHERE status = 'FAILED')::bigint AS failed_n,
       COALESCE(SUM(amount_minor), 0)::bigint AS volume_minor
     FROM gateway_transactions
     WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz`,
    [rangeStart, rangeEnd]
  );
  const t = txAgg.rows?.[0] || {};
  const total = Number(t.total) || 0;
  const successN = Number(t.success_n) || 0;
  const voidN = Number(t.void_n) || 0;
  const failedN = Number(t.failed_n) || 0;
  const volumeMinor = Number(t.volume_minor) || 0;
  const successRate = total > 0 ? successN / total : null;

  let auditN = 0;
  try {
    const a = await pool.query(
      `SELECT COUNT(*)::bigint AS c FROM gateway_audit_logs
       WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz`,
      [rangeStart, rangeEnd]
    );
    auditN = Number(a.rows?.[0]?.c) || 0;
  } catch {
    auditN = 0;
  }

  const regulatory = {
    report_kind: 'bot_monthly_compliance',
    schema_version: '1.0',
    jurisdiction: 'TH',
    period_start: String(periodStart),
    period_end: String(periodEnd),
    timezone: 'Asia/Bangkok',
    transaction_volume_minor: volumeMinor,
    transaction_count: total,
    success_count: successN,
    success_rate: successRate,
    voided_count: voidN,
    failed_count: failedN,
    fraud_incidents_void: voidN,
    admin_audit_events: auditN,
    generated_at: new Date().toISOString(),
    ...(manual?.reason
      ? {
          manual_regeneration: true,
          manual_reason: String(manual.reason).slice(0, 2000),
          manual_requested_by: manual.adminEmail || null,
        }
      : {}),
  };

  const jsonStr = JSON.stringify(regulatory, null, 2);
  const hash = crypto.createHash('sha256').update(jsonStr, 'utf8').digest('hex');
  const csvHeader =
    'metric,value\n' +
    `transaction_volume_minor,${volumeMinor}\n` +
    `transaction_count,${total}\n` +
    `success_count,${successN}\n` +
    `success_rate,${successRate != null ? successRate.toFixed(6) : ''}\n` +
    `voided_count,${voidN}\n` +
    `failed_count,${failedN}\n` +
    `admin_audit_events,${auditN}\n`;

  let ins;
  try {
    ins = await pool.query(
      `INSERT INTO gateway_settlement_reports (
         report_period_start, report_period_end, currency, total_volume_minor, total_fee_minor,
         transaction_count, status, regulatory_metadata, snapshot_hash_sha256
       ) VALUES ($1::date, $2::date, 'THB', $3, 0, $4::int, 'FILED', $5::jsonb, $6)
       RETURNING id`,
      [periodStart, periodEnd, volumeMinor, total, JSON.stringify(regulatory), hash]
    );
  } catch (e) {
    if (e && String(e.code) === '23505') {
      return { skipped: true, reason: 'unique_conflict', message: e?.message };
    }
    throw e;
  }

  const id = ins.rows?.[0]?.id;
  const files = [];
  try {
    const dir = join(__dirname, '..', 'logs', 'gateway-compliance');
    ensurePrivateComplianceDir(dir);
    const base = `bot-compliance-${periodStart}_${periodEnd}`;
    const jp = join(dir, `${base}.json`);
    const cp = join(dir, `${base}.csv`);
    writePrivateComplianceFile(jp, jsonStr);
    writePrivateComplianceFile(cp, csvHeader);
    files.push(jp, cp);
  } catch (e) {
    files.push(`write_error:${e?.message || e}`);
  }

  return { id, files, regulatory, snapshot_hash_sha256: hash };
}

/**
 * Aggregates gateway_transactions + gateway_audit_logs for regulatory_metadata JSON.
 * Inserts one row into gateway_settlement_reports per month (idempotent).
 *
 * @param {import('pg').Pool} pool
 * @returns {Promise<{ skipped?: boolean, id?: string, files?: string[], regulatory?: object, reason?: string }>}
 */
export async function generateMonthlyComplianceReport(pool) {
  const bounds = await getPreviousMonthBoundsBangkok(pool);
  return generateComplianceSnapshot(pool, bounds, { skipIfExists: true });
}

/**
 * Manual / backfill: generate BOT compliance snapshot for a specific calendar month (Asia/Bangkok).
 *
 * @param {import('pg').Pool} pool
 * @param {number} year
 * @param {number} month 1–12
 * @param {{ force?: boolean, manualReason?: string, adminEmail?: string | null }} [opt]
 * @returns {Promise<{ skipped?: boolean, id?: string, files?: string[], regulatory?: object, reason?: string, error?: string }>}
 */
export async function generateComplianceReportForYearMonth(pool, year, month, opt = {}) {
  const y = Math.floor(Number(year));
  const m = Math.floor(Number(month));
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    return { error: 'invalid_year_month', skipped: true };
  }
  if (y < 2020 || y > 2100) {
    return { error: 'year_out_of_range', skipped: true };
  }

  const fut = await pool.query(
    `SELECT make_date($1::int, $2::int, 1) > date_trunc('month', timezone('Asia/Bangkok', now())::timestamp)::date AS is_future`,
    [y, m]
  );
  if (fut.rows?.[0]?.is_future === true) {
    return { error: 'future_month_not_allowed', skipped: true };
  }

  const bounds = await getCalendarMonthBoundsBangkok(pool, y, m);
  return generateComplianceSnapshot(pool, bounds, {
    skipIfExists: !opt.force,
    forceRegenerate: opt.force === true,
    manual: {
      reason: opt.manualReason || null,
      adminEmail: opt.adminEmail || null,
    },
  });
}
