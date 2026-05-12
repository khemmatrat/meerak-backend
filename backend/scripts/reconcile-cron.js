#!/usr/bin/env node
/**
 * Reconcile Cron — compare processor-reported balance vs platform ledger (daily).
 *
 * ENV: PAYMENT_GATEWAY_SECRET_KEY, PAYMENT_GATEWAY_API_HOST
 */
import pg from 'pg';
import { fileURLToPath } from 'url';
import { join, dirname, resolve } from 'path';
import dotenv from 'dotenv';
import { PaymentHttpClient } from '../lib/paymentHttpClient.js';
import { getPaymentGatewaySecretKey } from '../lib/paymentManager.js';

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

async function runReconcile() {
  const secretKey = getPaymentGatewaySecretKey();
  if (!secretKey) {
    console.log('[reconcile] Payment gateway key not configured, skip');
    return { ok: false, reason: 'no_gateway_key' };
  }
  const client = new PaymentHttpClient(secretKey);

  let gatewayBalanceTHB = 0;
  try {
    const bal = await client.getBalance();
    const availableSatang = bal.available || bal.total || 0;
    gatewayBalanceTHB = Math.round(Number(availableSatang)) / 100;
  } catch (e) {
    console.error('[reconcile] Gateway getBalance failed:', e.message);
    return { ok: false, reason: 'gateway_error', error: e.message };
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
  const diff = Math.round((gatewayBalanceTHB - platformBalanceTHB) * 100) / 100;

  if (Math.abs(diff) <= THRESHOLD_THB) {
    console.log(`[reconcile] OK — Gateway ฿${gatewayBalanceTHB.toLocaleString()} | Platform ฿${platformBalanceTHB.toLocaleString()} | diff ฿${diff}`);
    return { ok: true, gateway: gatewayBalanceTHB, platform: platformBalanceTHB, diff };
  }

  console.warn(`[reconcile] ALERT — diff ฿${diff} exceeds threshold ฿${THRESHOLD_THB}`);
  await pool.query(
    `INSERT INTO reconcile_alerts (gateway_reported_balance_thb, platform_balance_thb, diff_thb, threshold_thb)
     VALUES ($1, $2, $3, $4)`,
    [gatewayBalanceTHB, platformBalanceTHB, diff, THRESHOLD_THB]
  ).catch((e) => {
    if (e.code === '42P01') console.warn('[reconcile] reconcile_alerts table not found, run migration 081/137');
    else console.error('[reconcile] Insert alert failed:', e.message);
  });

  const { notifyReconcileAlert } = await import('../lib/alertNotifier.js').catch(() => ({ notifyReconcileAlert: async () => {} }));
  await notifyReconcileAlert({
    gateway_reported_balance_thb: gatewayBalanceTHB,
    platform_balance_thb: platformBalanceTHB,
    diff_thb: diff,
  }).catch((e) => console.warn('[reconcile] Notification failed:', e?.message));

  return { ok: false, alert: true, gateway: gatewayBalanceTHB, platform: platformBalanceTHB, diff };
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
