#!/usr/bin/env node
/**
 * Reconcile Cron — ตรวจจับเงินรั่ว
 * รันตอนตี 3 ของทุกวัน: เทียบ Omise Balance กับ platform_balance
 * ถ้าต่างกันเกิน 1 บาท → สร้าง reconcile_alerts
 *
 * วิธีใช้:
 *   node backend/scripts/reconcile-cron.js
 *   Cron: 0 3 * * * (ทุกวัน 03:00 น.)
 *
 * ENV: OMISE_SECRET_KEY หรือ OMISE_SECRET_KEY_TEST
 */
import pg from 'pg';
import { fileURLToPath } from 'url';
import { join, dirname, resolve } from 'path';
import dotenv from 'dotenv';
import { OmiseClient } from '../lib/omise-client.js';

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

const THRESHOLD_THB = parseFloat(process.env.RECONCILE_THRESHOLD_THB || '1');
const OMISE_KEY = process.env.OMISE_SECRET_KEY || (process.env.NODE_ENV !== 'production' ? process.env.OMISE_SECRET_KEY_TEST : null);

async function runReconcile() {
  if (!OMISE_KEY) {
    console.log('[reconcile] Omise key not configured, skip');
    return { ok: false, reason: 'no_omise_key' };
  }
  const omise = new OmiseClient(OMISE_KEY);

  let omiseBalanceTHB = 0;
  try {
    const bal = await omise.getBalance();
    const availableSatang = bal.available || bal.total || 0;
    omiseBalanceTHB = Math.round(Number(availableSatang)) / 100;
  } catch (e) {
    console.error('[reconcile] Omise getBalance failed:', e.message);
    return { ok: false, reason: 'omise_error', error: e.message };
  }

  const platformRes = await pool.query(`
    SELECT (
      COALESCE(SUM(CASE WHEN event_type = 'wallet_deposit'
        THEN amount - COALESCE(gateway_fee_amount, 0)
        ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN event_type = 'user_payout_withdrawal' THEN amount ELSE 0 END), 0)
    ) AS platform_balance
    FROM payment_ledger_audit
  `).catch(() => ({ rows: [{ platform_balance: 0 }] }));

  const platformBalanceTHB = parseFloat(platformRes.rows?.[0]?.platform_balance || 0);
  const diff = Math.round((omiseBalanceTHB - platformBalanceTHB) * 100) / 100;

  if (Math.abs(diff) <= THRESHOLD_THB) {
    console.log(`[reconcile] OK — Omise ฿${omiseBalanceTHB.toLocaleString()} | Platform ฿${platformBalanceTHB.toLocaleString()} | diff ฿${diff}`);
    return { ok: true, omise: omiseBalanceTHB, platform: platformBalanceTHB, diff };
  }

  console.warn(`[reconcile] ALERT — diff ฿${diff} exceeds threshold ฿${THRESHOLD_THB}`);
  await pool.query(
    `INSERT INTO reconcile_alerts (omise_balance_thb, platform_balance_thb, diff_thb, threshold_thb)
     VALUES ($1, $2, $3, $4)`,
    [omiseBalanceTHB, platformBalanceTHB, diff, THRESHOLD_THB]
  ).catch((e) => {
    if (e.code === '42P01') console.warn('[reconcile] reconcile_alerts table not found, run migration 081');
    else console.error('[reconcile] Insert alert failed:', e.message);
  });

  // Auto-Notification: Line Notify + Email ไปเจ้านาย/ทีมบัญชี
  const { notifyReconcileAlert } = await import('../lib/alertNotifier.js').catch(() => ({ notifyReconcileAlert: async () => {} }));
  await notifyReconcileAlert({ omise_balance_thb: omiseBalanceTHB, platform_balance_thb: platformBalanceTHB, diff_thb: diff }).catch((e) => console.warn('[reconcile] Notification failed:', e?.message));

  return { ok: false, alert: true, omise: omiseBalanceTHB, platform: platformBalanceTHB, diff };
}

export { runReconcile };
export async function runReconcileAndClose() {
  const r = await runReconcile();
  await pool.end();
  return r;
}

async function main() {
  console.log('[reconcile] Starting...');
  const result = await runReconcile();
  console.log('[reconcile] Done.', result);
  await pool.end();
}

const isMain = process.argv[1] && resolve(process.argv[1]) === __filename;
if (isMain) {
  main().catch((e) => {
    console.error('[reconcile] Fatal:', e);
    process.exit(1);
  });
}
