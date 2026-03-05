#!/usr/bin/env node
/**
 * Manual Reconcile — ตรวจสอบยอด 24 ชม. ล่าสุด
 * รันเมื่อไหร่ก็ได้เพื่อ trigger Reconcile check ด้วยตนเอง
 *
 * วิธีใช้:
 *   node backend/scripts/verify-last-24h.js
 *
 * ENV: OMISE_SECRET_KEY, LINE_NOTIFY_TOKEN, ALERT_EMAIL_TO (สำหรับแจ้งเตือน)
 */
import { runReconcileAndClose } from './reconcile-cron.js';
import pg from 'pg';
import { fileURLToPath } from 'url';
import { join, dirname, resolve } from 'path';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const __filename = fileURLToPath(import.meta.url);
dotenv.config({ path: join(__dirname, '..', '..', '.env') });

const { Pool } = pg;
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_DATABASE || 'meera_db',
  user: process.env.DB_USER || 'meera',
  password: process.env.DB_PASSWORD || 'meera123',
});

async function getLast24hSummary() {
  const res = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE event_type = 'wallet_deposit') AS deposits,
      COALESCE(SUM(CASE WHEN event_type = 'wallet_deposit' THEN COALESCE(net_amount, amount) ELSE 0 END), 0) AS deposit_total,
      COUNT(*) FILTER (WHERE event_type = 'user_payout_withdrawal') AS withdrawals,
      COALESCE(SUM(CASE WHEN event_type = 'user_payout_withdrawal' THEN amount ELSE 0 END), 0) AS withdrawal_total
    FROM payment_ledger_audit
    WHERE created_at >= NOW() - INTERVAL '24 hours'
  `).catch(() => ({ rows: [{ deposits: 0, deposit_total: 0, withdrawals: 0, withdrawal_total: 0 }] }));
  return res.rows?.[0] || {};
}

async function main() {
  console.log('[verify-24h] Manual Reconcile Check (Last 24h summary + Full Reconcile)\n');
  const summary = await getLast24hSummary();
  console.log('📊 Last 24 hours:');
  console.log(`   Deposits: ${summary.deposits || 0} | Total +฿${Number(summary.deposit_total || 0).toLocaleString()}`);
  console.log(`   Withdrawals: ${summary.withdrawals || 0} | Total -฿${Number(summary.withdrawal_total || 0).toLocaleString()}`);
  console.log('');
  const result = await runReconcileAndClose();
  console.log('\n📌 Result:', result.ok ? '✅ OK' : (result.alert ? '🚨 ALERT CREATED' : '⚠️ ' + (result.reason || 'Unknown')));
  await pool.end();
}

main().catch((e) => {
  console.error('[verify-24h] Fatal:', e);
  process.exit(1);
});
