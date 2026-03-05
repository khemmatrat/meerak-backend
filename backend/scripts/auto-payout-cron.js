#!/usr/bin/env node
/**
 * Auto Payout Cron — 24–36 ชม.
 * 1. Auto-release: ปล่อย wallet_pending → wallet_balance เมื่อ release_deadline ครบ
 * 2. Auto-payout: โอนเงินจาก wallet ไปบัญชีธนาคารผ่าน Omise Transfer (ถ้าเปิดใช้)
 *
 * วิธีใช้:
 *   node backend/scripts/auto-payout-cron.js
 *   หรือตั้ง cron: 0 */6 * * * (ทุก 6 ชม.)
 *
 * ENV:
 *   AUTO_PAYOUT_RELEASE_ENABLED=1 (default: 1)
 *   AUTO_PAYOUT_RELEASE_HOURS=24 (default: 24, ใช้ 36 ได้)
 *   AUTO_PAYOUT_OMISE_ENABLED=0 (default: 0 — เปิดเมื่อพร้อมใช้ Omise Transfer)
 *   AUTO_PAYOUT_JOB_LIMIT=100
 *   AUTO_PAYOUT_REQUEST_LIMIT=50
 */
import pg from 'pg';
import { fileURLToPath } from 'url';
import { join, dirname, resolve } from 'path';
import dotenv from 'dotenv';
import { OmiseClient } from '../lib/omise-client.js';
import { resolveBankBrand } from '../lib/bank-brand-map.js';

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
const OMISE_ENABLED = process.env.AUTO_PAYOUT_OMISE_ENABLED === '1';
const JOB_LIMIT = parseInt(process.env.AUTO_PAYOUT_JOB_LIMIT || '100', 10);
const REQUEST_LIMIT = parseInt(process.env.AUTO_PAYOUT_REQUEST_LIMIT || '50', 10);

async function isWalletFrozen(userId) {
  if (!userId) return false;
  const r = await pool.query(
    'SELECT wallet_frozen, account_status FROM users WHERE id = $1 OR id::text = $1 LIMIT 1',
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
  // Release when release_deadline has passed (default 24h after job completion)
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
          `UPDATE users SET wallet_pending = wallet_pending - $1, wallet_balance = wallet_balance + $1 WHERE id = $2`,
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
        await client.query('ROLLBACK').catch(() => {});
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

/** สร้าง Omise Recipient จาก bank_details (provider_name = bank name จาก Profile) */
function buildOmiseRecipient(bankDetails, userEmail = null) {
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

/** Auto-payout: โอนเงินผ่าน Omise Transfer สำหรับ payout_requests ที่ pending */
async function runAutoPayoutOmise() {
  if (!OMISE_ENABLED || !process.env.OMISE_SECRET_KEY) {
    return { processed: 0, errors: [] };
  }
  const errors = [];
  let processed = 0;
  const rows = await pool.query(
    `SELECT p.id, p.user_id, p.amount, COALESCE(p.withdrawal_fee, 35) AS withdrawal_fee, p.bank_details,
            u.email
     FROM payout_requests p
     JOIN users u ON u.id = p.user_id
     WHERE p.status = 'pending'
       AND p.bank_details->>'channel' = 'bank_transfer'
       AND (p.bank_details->>'account_number') IS NOT NULL
     ORDER BY p.created_at ASC
     LIMIT $1`,
    [REQUEST_LIMIT]
  );
  const omise = new OmiseClient(process.env.OMISE_SECRET_KEY);
  for (const row of rows.rows || []) {
    const payoutId = row.id;
    const userId = row.user_id;
    const amount = parseFloat(row.amount);
    const withdrawalFee = parseFloat(row.withdrawal_fee || 35) || 35;
    const totalDeduct = amount + withdrawalFee;
    const bankDetails = row.bank_details || {};
    if (amount <= 0) continue;
    try {
      const frozen = await isWalletFrozen(userId);
      if (frozen) {
        console.warn(`[auto-payout] Skip payout ${payoutId}: user wallet frozen`);
        continue;
      }
      const recipientParams = buildOmiseRecipient(bankDetails, row.email);
      if (!recipientParams) {
        errors.push({ payoutId, error: 'Invalid bank_details for Omise' });
        continue;
      }
      const recipient = await omise.createRecipient(recipientParams);
      const recipientId = recipient?.id;
      if (!recipientId) {
        errors.push({ payoutId, error: 'Omise createRecipient failed' });
        continue;
      }
      const transfer = await omise.createTransfer(amount, recipientId);
      const transferId = transfer?.id;
      if (!transferId) {
        errors.push({ payoutId, error: 'Omise createTransfer failed' });
        continue;
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const bal = await client.query('SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE', [userId]);
        if (!bal.rows?.length || parseFloat(bal.rows[0].wallet_balance || 0) < totalDeduct) {
          await client.query('ROLLBACK');
          errors.push({ payoutId, error: 'Insufficient wallet balance (รวมค่าธรรมเนียมถอน)' });
          continue;
        }
        await client.query(
          'UPDATE users SET wallet_balance = wallet_balance - $1, updated_at = NOW() WHERE id = $2',
          [totalDeduct, userId]
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
              omise_recipient_id: recipientId,
              omise_transfer_id: transferId,
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
                [ledgerId, feeMargin, amount, JSON.stringify({ payout_request_id: payoutId, withdrawal_fee: withdrawalFee, omise_cost: 30 })]
              );
            } catch (_) { /* platform_revenues might not exist */ }
          }
        }
        await client.query(
          `UPDATE payout_requests SET status = 'approved', processed_at = NOW(), processed_by = 'auto-payout-cron',
           transaction_id = $1 WHERE id = $2`,
          [transferId, payoutId]
        );
        await client.query('COMMIT');
        processed++;
        console.log(`[auto-payout] Processed payout ${payoutId} → ฿${amount} via Omise ${transferId}`);
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    } catch (err) {
      errors.push({ payoutId, error: err.message });
      console.error(`[auto-payout] Omise payout error ${payoutId}:`, err.message);
    }
  }
  return { processed, errors };
}

export { runAutoPayoutOmise };

async function main() {
  console.log('[auto-payout] Starting cron run...');
  const releaseResult = await runAutoRelease();
  console.log(`[auto-payout] Auto-release: ${releaseResult.released} jobs released`);
  const payoutResult = await runAutoPayoutOmise();
  console.log(`[auto-payout] Auto-payout Omise: ${payoutResult.processed} processed`);
  if (releaseResult.errors.length || payoutResult.errors.length) {
    console.warn('[auto-payout] Errors:', [...releaseResult.errors, ...payoutResult.errors]);
  }
  await pool.end();
  console.log('[auto-payout] Done.');
}

// Run main only when executed directly (not when imported by server)
const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && resolve(process.argv[1]) === __filename;
if (isMain) {
  main().catch((e) => {
    console.error('[auto-payout] Fatal:', e);
    process.exit(1);
  });
}
