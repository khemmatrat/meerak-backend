#!/usr/bin/env node
/**
 * Auto Payout Cron — 24–36 ชม.
 * 1. Auto-release: ปล่อย wallet_pending → wallet_balance เมื่อ release_deadline ครบ
 * 2. Auto-payout: โอนเงินจาก wallet ไปบัญชีธนาคารผ่าน Payment Gateway Transfer (ถ้าเปิดใช้)
 *
 * วิธีใช้:
 *   node backend/scripts/auto-payout-cron.js
 *
 * ENV:
 *   AUTO_PAYOUT_RELEASE_ENABLED=1 (default: 1)
 *   AUTO_PAYOUT_RELEASE_HOURS=24 (default: 24, ใช้ 36 ได้)
 *   AUTO_PAYOUT_GATEWAY_TRANSFER_ENABLED=0 (default: 0)
 *   PAYMENT_GATEWAY_SECRET_KEY / PAYMENT_GATEWAY_SECRET_KEY_TEST
 *   PAYMENT_GATEWAY_API_HOST (e.g. api processor host for REST)
 *   AUTO_PAYOUT_JOB_LIMIT=100
 *   AUTO_PAYOUT_REQUEST_LIMIT=50
 */
import pg from 'pg';
import { fileURLToPath } from 'url';
import { join, dirname, resolve } from 'path';
import dotenv from 'dotenv';
import { resolveBankBrand } from '../lib/bank-brand-map.js';
import {
  createPaymentHttpClient,
  isAutoPayoutGatewayTransferEnabled,
  getPaymentGatewaySecretKey,
} from '../lib/paymentManager.js';
import {
  getSoleCompanyDisbursementInfo,
  isPayoutDestinationCompanySoleDisbursementSync,
} from '../lib/companySoleDisbursement.js';

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

const RELEASE_ENABLED = process.env.AUTO_PAYOUT_RELEASE_ENABLED !== '0';
const RELEASE_HOURS = parseInt(process.env.AUTO_PAYOUT_RELEASE_HOURS || '24', 10);
const JOB_LIMIT = parseInt(process.env.AUTO_PAYOUT_JOB_LIMIT || '100', 10);
const REQUEST_LIMIT = parseInt(process.env.AUTO_PAYOUT_REQUEST_LIMIT || '50', 10);

async function isWalletFrozen(userId) {
  if (!userId) return false;
  const r = await pool.query(
    'SELECT wallet_frozen, account_status FROM users WHERE id = $1::uuid LIMIT 1',
    [userId]
  );
  const u = r.rows?.[0];
  if (!u) return false;
  return !!(u.wallet_frozen || u.account_status === 'suspended' || u.account_status === 'banned');
}

/** Auto-release: ปล่อย pending → balance เมื่อ release_deadline ครบ */
async function runAutoRelease() {
  if (!RELEASE_ENABLED) {
    console.log('[auto-payout] Auto-release disabled (AUTO_PAYOUT_RELEASE_ENABLED=0)');
    return { released: 0, errors: [] };
  }
  const errors = [];
  let released = 0;
  const rows = await pool.query(
    `SELECT j.id, j.accepted_by, j.payment_details
     FROM jobs j
     WHERE j.status = 'completed'
       AND COALESCE(j.payment_details->>'released_status', '') = 'pending'
       AND (j.payment_details->>'release_deadline')::timestamptz < NOW()
     ORDER BY j.updated_at ASC
     LIMIT $1`,
    [JOB_LIMIT]
  );
  for (const row of rows.rows || []) {
    const jobId = row.id;
    const pd = row.payment_details || {};
    const providerReceive = parseFloat(pd.provider_receive);
    const providerId = row.accepted_by;
    if (isNaN(providerReceive) || providerReceive <= 0) continue;
    try {
      const frozen = await isWalletFrozen(providerId);
      if (frozen) {
        console.warn(`[auto-payout] Skip job ${jobId}: provider wallet frozen`);
        continue;
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const upd = await client.query(
          `UPDATE jobs SET
             payment_details = jsonb_set(COALESCE(payment_details,'{}'::jsonb), '{released_status}', '"released"'),
             updated_at = NOW()
           WHERE id = $1 AND (COALESCE(payment_details->>'released_status', '') = 'pending')
           RETURNING id`,
          [jobId]
        );
        if (!upd.rows?.length) continue;
        await client.query(
          `UPDATE users SET wallet_pending = wallet_pending - $1, wallet_balance = wallet_balance + $1,
             wallet_balance_withdrawable = COALESCE(wallet_balance_withdrawable, 0) + $1 WHERE id = $2`,
          [providerReceive, providerId]
        );
        await client.query(
          `UPDATE transactions SET status = 'completed', released_at = NOW()
           WHERE related_job_id = $1 AND user_id = $2 AND type = 'income' AND status = 'pending_release'`,
          [jobId, providerId]
        );
        await client.query('COMMIT');
        released++;
        console.log(`[auto-payout] Released job ${jobId} → provider ${providerId} ฿${providerReceive}`);
      } catch (e) {
        await client.query('ROLLBACK').catch(() => { });
        throw e;
      } finally {
        client.release();
      }
    } catch (err) {
      errors.push({ jobId, error: err.message });
      console.error(`[auto-payout] Release error job ${jobId}:`, err.message);
    }
  }
  return { released, errors };
}

export { runAutoRelease };

/** สร้าง payload recipient จาก bank_details (provider_name = bank name จาก Profile) */
function buildGatewayRecipientPayload(bankDetails, userEmail = null) {
  const name = bankDetails.account_name || bankDetails.provider_name || 'Payout';
  const number = String(bankDetails.account_number || '').trim();
  const bankName = (bankDetails.bank_name || bankDetails.provider_name || '').trim();
  const brand = resolveBankBrand(bankName);
  if (!brand || !number) return null;
  return {
    name,
    email: userEmail || `${name.replace(/\s/g, '.')}@payout.meerak.app`,
    type: 'individual',
    bank_account: { brand, number, name }
  };
}

/** Auto-payout: โอนผ่าน configured gateway สำหรับ payout_requests ที่ pending */
async function runAutoPayoutGatewayTransfer() {
  if (!isAutoPayoutGatewayTransferEnabled()) {
    return { processed: 0, errors: [] };
  }
  let secretKey;
  try {
    secretKey = getPaymentGatewaySecretKey();
  } catch {
    return { processed: 0, errors: [] };
  }
  if (!secretKey) {
    return { processed: 0, errors: [] };
  }

  const errors = [];
  let processed = 0;
  const rows = await pool.query(
    `SELECT p.id, p.user_id, p.amount, COALESCE(p.withdrawal_fee, 35) AS withdrawal_fee, p.bank_details,
            u.email, p.reconciliation_status
     FROM payout_requests p
     JOIN users u ON u.id = p.user_id
     WHERE p.status = 'pending'
       AND p.bank_details->>'channel' = 'bank_transfer'
       AND (p.bank_details->>'account_number') IS NOT NULL
       AND p.reconciliation_status = 'PASS'
     ORDER BY p.created_at ASC
     LIMIT $1`,
    [REQUEST_LIMIT]
  );

  let paymentClient;
  try {
    paymentClient = createPaymentHttpClient();
  } catch (e) {
    console.warn('[auto-payout] Gateway client not configured:', e?.message || e);
    return { processed: 0, errors: [{ payoutId: null, error: 'Gateway client not configured' }] };
  }

  const soleCompanyInfo = await getSoleCompanyDisbursementInfo(pool);

  for (const row of rows.rows || []) {
    const payoutId = row.id;
    const userId = row.user_id;
    const amount = parseFloat(row.amount);
    const withdrawalFee = parseFloat(row.withdrawal_fee || 35) || 35;
    const totalDeduct = amount + withdrawalFee;
    const bankDetails = row.bank_details || {};
    if (isPayoutDestinationCompanySoleDisbursementSync(bankDetails, soleCompanyInfo)) {
      console.warn(
        `[auto-payout] Skip payout ${payoutId}: destination matches company sole disbursement (approve manually as SUPER_ADMIN)`
      );
      continue;
    }
    if (amount <= 0) continue;
    const slipUrl = String(bankDetails.slip_url || bankDetails.slipUrl || '').trim();
    if (!slipUrl || !/^https?:\/\//i.test(slipUrl)) {
      console.warn(`[auto-payout] Skip payout ${payoutId}: missing slip_url (required for audit)`);
      continue;
    }
    try {
      const frozen = await isWalletFrozen(userId);
      if (frozen) {
        console.warn(`[auto-payout] Skip payout ${payoutId}: user wallet frozen`);
        continue;
      }
      const recipientParams = buildGatewayRecipientPayload(bankDetails, row.email);
      if (!recipientParams) {
        errors.push({ payoutId, error: 'Invalid bank_details for gateway transfer' });
        continue;
      }
      const recipient = await paymentClient.createRecipient(recipientParams);
      const recipientId = recipient?.id;
      if (!recipientId) {
        errors.push({ payoutId, error: 'Gateway createRecipient failed' });
        continue;
      }
      const transfer = await paymentClient.createTransfer(amount, recipientId);
      const transferId = transfer?.id;
      if (!transferId) {
        errors.push({ payoutId, error: 'Gateway createTransfer failed' });
        continue;
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const bal = await client.query(
          'SELECT wallet_balance, wallet_balance_withdrawable FROM users WHERE id = $1 FOR UPDATE',
          [userId]
        );
        const currentBalance = parseFloat(bal.rows?.[0]?.wallet_balance || 0);
        const currentWithdrawable = parseFloat(bal.rows?.[0]?.wallet_balance_withdrawable ?? currentBalance);
        if (!bal.rows?.length || currentBalance < totalDeduct) {
          await client.query('ROLLBACK');
          errors.push({ payoutId, error: 'Insufficient wallet balance (รวมค่าธรรมเนียมถอน)' });
          continue;
        }
        if (currentWithdrawable < amount) {
          await client.query('ROLLBACK');
          errors.push({ payoutId, error: 'Insufficient withdrawable balance for payout amount' });
          continue;
        }
        await client.query(
          `UPDATE users SET wallet_balance = wallet_balance - $1,
             wallet_balance_withdrawable = wallet_balance_withdrawable - $2,
             updated_at = NOW() WHERE id = $3`,
          [totalDeduct, amount, userId]
        );
        const ledgerId = `L-payout-${payoutId}-${Date.now()}`;
        const billNo = `PAYOUT-${payoutId}`;
        const txnNo = `T-PAYOUT-${payoutId}-${Date.now()}`;
        await client.query(
          `INSERT INTO payment_ledger_audit (id, event_type, payment_id, gateway, job_id, amount, currency, status, bill_no, transaction_no, provider_id, metadata)
           VALUES ($1, 'user_payout_withdrawal', $2, 'wallet', $2, $3, 'THB', 'completed', $4, $5, $6, $7)`,
          [
            ledgerId,
            payoutId,
            amount,
            billNo,
            txnNo,
            userId,
            JSON.stringify({
              leg: 'user_payout_withdrawal',
              payout_request_id: payoutId,
              auto_payout: true,
              gateway_recipient_ref: recipientId,
              gateway_transfer_ref: transferId,
              withdrawal_fee: withdrawalFee,
              net_transfer: amount
            })
          ]
        );
        if (withdrawalFee > 0) {
          const feeMargin = Math.round((withdrawalFee - 30) * 100) / 100;
          if (feeMargin > 0) {
            try {
              await client.query(
                `INSERT INTO platform_revenues (transaction_id, source_type, amount, gross_amount, metadata)
                 VALUES ($1, 'withdrawal_fee_margin', $2, $3, $4)`,
                [ledgerId, feeMargin, amount, JSON.stringify({ payout_request_id: payoutId, withdrawal_fee: withdrawalFee, processor_fixed_fee_thb: 30 })]
              );
            } catch (_) { /* platform_revenues might not exist */ }
          }
        }
        await client.query(
          `UPDATE payout_requests SET status = 'approved', processed_at = NOW(), processed_by = 'auto-payout-cron',
           transaction_id = $1, gateway_recipient_ref = $2, gateway_transfer_ref = $3 WHERE id = $4`,
          [transferId, recipientId, transferId, payoutId]
        );
        await client.query('COMMIT');
        processed++;
        console.log(`[auto-payout] Processed payout ${payoutId} → ฿${amount} via gateway transfer ${transferId}`);
      } catch (e) {
        await client.query('ROLLBACK').catch(() => { });
        throw e;
      } finally {
        client.release();
      }
    } catch (err) {
      errors.push({ payoutId, error: err.message });
      console.error(`[auto-payout] Gateway payout error ${payoutId}:`, err.message);
    }
  }
  return { processed, errors };
}

export { runAutoPayoutGatewayTransfer };

async function main() {
  console.log('[auto-payout] Starting cron run...');
  const releaseResult = await runAutoRelease();
  console.log(`[auto-payout] Auto-release: ${releaseResult.released} jobs released`);
  const payoutResult = await runAutoPayoutGatewayTransfer();
  console.log(`[auto-payout] Auto-payout gateway: ${payoutResult.processed} processed`);
  if (releaseResult.errors.length || payoutResult.errors.length) {
    console.warn('[auto-payout] Errors:', [...releaseResult.errors, ...payoutResult.errors]);
  }
  await pool.end();
  console.log('[auto-payout] Done.');
}

const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && resolve(process.argv[1]) === __filename;
if (isMain) {
  main().catch((e) => {
    console.error('[auto-payout] Fatal:', e);
    process.exit(1);
  });
}
