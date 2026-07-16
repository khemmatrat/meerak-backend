#!/usr/bin/env node
/**
 * Rider COD reconciliation cron — PROVISIONAL (awaiting business sign-off).
 *
 * Reuses reconciliation_runs / reconciliation_lines / financial_audit_log via
 * runCodReconciliation(). Compares COD collected vs deposited vs outstanding and
 * flags late remittances.
 *
 * Usage:
 *   node backend/scripts/cod-reconcile-cron.js
 *
 * ENV:
 *   RIDER_COD_RECON_HOURS_BACK=24   (window for collected/deposited totals)
 *   RIDER_COD_RECON_LATE_HOURS=24   (SLA for remitting collected cash)
 *   RIDER_COD_RECON_EPSILON_THB=1   (balance-drift tolerance)
 */
import pg from 'pg';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import dotenv from 'dotenv';
import { runCodReconciliation } from '../lib/riderCodLedger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..', '..');
dotenv.config({ path: join(rootDir, '.env') });

const { Pool } = pg;
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_DATABASE || 'meera_db',
  user: process.env.DB_USER || 'meera',
  password: process.env.DB_PASSWORD || 'meera123',
});

async function main() {
  const hoursBack = parseInt(process.env.RIDER_COD_RECON_HOURS_BACK || '24', 10);
  const lateHours = parseInt(process.env.RIDER_COD_RECON_LATE_HOURS || '24', 10);
  const result = await runCodReconciliation(pool, { hoursBack, lateHours });
  console.log('[cod-reconcile]', JSON.stringify(result));
  if (result.status === 'mismatch_found') {
    console.warn('[cod-reconcile] discrepancies found — review reconciliation_lines for run', result.run_id);
  }
}

main()
  .catch((e) => {
    console.error('[cod-reconcile] failed:', e?.message || e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
