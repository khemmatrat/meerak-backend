/**
 * Background admin CSV exports (scale — avoid blocking HTTP on large lists).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXPORT_DIR = path.join(__dirname, '..', 'tmp', 'admin-exports');

function ensureExportDir() {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ jobType: string, params?: object, createdBy?: string }} opts
 */
export async function createAdminAsyncExportJob(pool, opts) {
  ensureExportDir();
  const r = await pool.query(
    `INSERT INTO admin_async_export_jobs (job_type, params_json, created_by, status)
     VALUES ($1, $2::jsonb, $3, 'queued')
     RETURNING id, created_at`,
    [opts.jobType, JSON.stringify(opts.params || {}), opts.createdBy || null],
  );
  return { id: r.rows[0].id, created_at: r.rows[0].created_at };
}

async function buildWalletDepositChargesCsv(pool, params) {
  const where = [];
  const qParams = [];
  const sourceType = String(params.source_type || '').trim().toLowerCase();
  const status = String(params.status || '').trim().toLowerCase();
  const userId = String(params.user_id || '').trim();
  if (sourceType && sourceType !== 'all') {
    qParams.push(sourceType);
    where.push(`COALESCE(c.source_type, 'promptpay') = $${qParams.length}`);
  }
  if (status && status !== 'all') {
    qParams.push(status);
    where.push(`LOWER(COALESCE(c.status, '')) = $${qParams.length}`);
  }
  if (userId) {
    qParams.push(userId);
    where.push(`c.user_id = $${qParams.length}::uuid`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await pool.query(
    `SELECT c.charge_id, c.user_id, u.email AS user_email, c.amount, c.currency, c.status,
            COALESCE(c.source_type, 'promptpay') AS source_type, c.ledger_id,
            c.created_at, c.completed_at
     FROM wallet_deposit_charges c
     LEFT JOIN users u ON u.id = c.user_id
     ${whereSql}
     ORDER BY c.created_at DESC
     LIMIT 50000`,
    qParams,
  );
  const header = [
    'charge_id', 'user_id', 'user_email', 'amount', 'currency', 'status',
    'source_type', 'ledger_id', 'created_at', 'completed_at',
  ];
  const lines = [header.join(',')];
  for (const r of rows.rows || []) {
    lines.push(
      header.map((h) => csvEscape(r[h])).join(','),
    );
  }
  return { csv: lines.join('\n'), row_count: (rows.rows || []).length };
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ limit?: number }} [opts]
 */
export async function processAdminAsyncExportJobs(pool, opts = {}) {
  const limit = Math.min(parseInt(String(opts.limit || 3), 10) || 3, 10);
  ensureExportDir();
  const claim = await pool.query(
    `UPDATE admin_async_export_jobs j
     SET status = 'processing', updated_at = NOW()
     WHERE j.id IN (
       SELECT id FROM admin_async_export_jobs
       WHERE status = 'queued'
       ORDER BY created_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING j.id, j.job_type, j.params_json`,
    [limit],
  );

  for (const job of claim.rows || []) {
    try {
      let csv = '';
      let rowCount = 0;
      if (job.job_type === 'wallet_deposit_charges_csv') {
        const built = await buildWalletDepositChargesCsv(pool, job.params_json || {});
        csv = built.csv;
        rowCount = built.row_count;
      } else {
        throw new Error(`unknown_export_type:${job.job_type}`);
      }
      const filename = `${job.job_type}_${job.id}.csv`;
      const fullPath = path.join(EXPORT_DIR, filename);
      fs.writeFileSync(fullPath, `\uFEFF${csv}`, 'utf8');
      await pool.query(
        `UPDATE admin_async_export_jobs
         SET status = 'done', result_filename = $2, row_count = $3, completed_at = NOW(), updated_at = NOW()
         WHERE id = $1::uuid`,
        [job.id, filename, rowCount],
      );
    } catch (e) {
      await pool.query(
        `UPDATE admin_async_export_jobs
         SET status = 'failed', error = $2, updated_at = NOW()
         WHERE id = $1::uuid`,
        [job.id, String(e?.message || e).slice(0, 2000)],
      );
    }
  }
}

export function getAdminExportFilePath(filename) {
  const base = path.basename(String(filename || ''));
  if (!base || base.includes('..')) return null;
  return path.join(EXPORT_DIR, base);
}

export function startAdminAsyncExportWorker(pool) {
  if (String(process.env.ADMIN_ASYNC_EXPORT_WORKER || '1').trim() === '0') return null;
  const intervalMs = Math.max(parseInt(process.env.ADMIN_EXPORT_WORKER_INTERVAL_MS || '5000', 10) || 5000, 2000);
  const tick = () => {
    processAdminAsyncExportJobs(pool).catch((e) => {
      if (String(e?.code) !== '42P01') console.warn('[adminAsyncExport]', e?.message || e);
    });
  };
  tick();
  return setInterval(tick, intervalMs);
}

/** Pre-create current + next month ledger partition tables */
export async function ensureLedgerPartitionsAhead(pool) {
  try {
    await pool.query(`SELECT ensure_payment_ledger_audit_month_partition(CURRENT_DATE)`);
    await pool.query(`SELECT ensure_payment_ledger_audit_month_partition((date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date)`);
  } catch (e) {
    if (String(e?.code) !== '42883' && String(e?.code) !== '42P01') {
      console.warn('[ledgerPartition]', e?.message || e);
    }
  }
}

export function startLedgerPartitionMaintenance(pool) {
  if (String(process.env.LEDGER_PARTITION_MAINTENANCE || '1').trim() === '0') return null;
  ensureLedgerPartitionsAhead(pool).catch(() => { });
  return setInterval(() => {
    ensureLedgerPartitionsAhead(pool).catch(() => { });
  }, 24 * 60 * 60 * 1000);
}
