/**
 * Paid Rider OS credit topup — main wallet deduct + PaySo PromptPay.
 */
import crypto from 'crypto';
import { createPaysoWalletDepositCharge, queryPaysoWalletDepositStatus } from '../services/paysoService.js';
import { isPaysoEnabledFromEnv } from '../lib/paysoEnvFlag.js';
import { riderCreditTopup, getRiderCreditSummary } from './riderCreditLedger.js';
import { scheduleRiderCreditPaysoReconcile } from './riderCreditTopupReconcile.js';

export function riderMicroFromThb(thb) {
  return Math.round(Number(thb) * 100);
}

export function riderThbFromMicro(micro) {
  return Math.round(Number(micro || 0)) / 100;
}

export async function resolveUserUuid(pool, userId) {
  const r = await pool.query(
    `SELECT id FROM users WHERE id::text = $1 OR firebase_uid = $1 LIMIT 1`,
    [String(userId)],
  );
  return r.rows?.[0]?.id || null;
}

async function getUserWallet(client, userUuid) {
  const r = await client.query(
    `SELECT wallet_balance, wallet_balance_withdrawable, wallet_frozen, account_status
       FROM users WHERE id = $1::uuid FOR UPDATE`,
    [userUuid],
  );
  return r.rows?.[0] || null;
}

export async function topupRiderCreditFromWallet(
  pool,
  { userId, riderId, amountMicro, idempotencyKey },
) {
  const amountThb = riderThbFromMicro(amountMicro);
  if (!(amountThb >= 1)) {
    const err = new Error('amount_min_1_thb');
    err.code = 'amount_min_1_thb';
    throw err;
  }

  const userUuid = await resolveUserUuid(pool, userId);
  if (!userUuid) {
    const err = new Error('user_not_found');
    err.code = 'user_not_found';
    throw err;
  }

  const idem = String(idempotencyKey || `wallet-topup-${userUuid}-${amountMicro}-${Date.now()}`);

  const dup = await pool.query(
    `SELECT status FROM rider_credit_topup_charges WHERE charge_id = $1 LIMIT 1`,
    [idem],
  ).catch(() => ({ rows: [] }));
  if (dup.rows?.[0]?.status === 'success') {
    const summary = await getRiderCreditSummary(pool, riderId, userId);
    return { ok: true, duplicate: true, method: 'wallet', summary };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const u = await getUserWallet(client, userUuid);
    if (!u) throw Object.assign(new Error('user_not_found'), { code: 'user_not_found' });
    if (u.wallet_frozen || String(u.account_status || '').toLowerCase() === 'suspended') {
      throw Object.assign(new Error('wallet_frozen'), { code: 'wallet_frozen' });
    }

    const balance = Number(u.wallet_balance || 0);
    const withdrawable = Number(u.wallet_balance_withdrawable ?? balance);
    if (withdrawable < amountThb - 0.001) {
      throw Object.assign(new Error('insufficient_wallet_balance'), {
        code: 'insufficient_wallet_balance',
        balance: withdrawable,
        required: amountThb,
      });
    }

    await client.query(
      `UPDATE users SET
         wallet_balance = GREATEST(0, COALESCE(wallet_balance, 0) - $1),
         wallet_balance_withdrawable = GREATEST(0, COALESCE(wallet_balance_withdrawable, 0) - LEAST($1, COALESCE(wallet_balance_withdrawable, 0))),
         updated_at = NOW()
       WHERE id = $2::uuid`,
      [amountThb, userUuid],
    );

    await client.query(
      `INSERT INTO rider_credit_topup_charges
        (charge_id, user_id, rider_id, amount, amount_micro, status, payment_method, completed_at)
       VALUES ($1, $2, $3, $4, $5, 'success', 'wallet', NOW())
       ON CONFLICT (charge_id) DO NOTHING`,
      [idem, userUuid, riderId, amountThb, amountMicro],
    ).catch((e) => {
      if (e.code === '42P01') return;
      throw e;
    });

    await client.query(
      `INSERT INTO payment_ledger_audit
        (id, event_type, payment_id, gateway, job_id, amount, currency, status, bill_no, transaction_no, user_id, metadata)
       VALUES ($1, 'rider_credit_topup', $2, 'wallet', $3, $4, 'THB', 'completed', $5, $6, $7, $8::jsonb)`,
      [
        `L-RIDER-CR-${crypto.randomUUID().slice(0, 8)}`,
        idem,
        riderId,
        amountThb,
        `RIDER-CR-${idem.slice(-8).toUpperCase()}`,
        `T-RIDER-CR-${Date.now()}`,
        userUuid,
        JSON.stringify({ rider_id: riderId, amount_micro: amountMicro, method: 'wallet' }),
      ],
    ).catch(() => null);

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  const summary = await riderCreditTopup(pool, {
    rider_id: riderId,
    user_id: userId,
    amount_micro: amountMicro,
    reason: `เติมเครดิตจากวอลเล็ตหลัก ฿${amountThb.toFixed(2)}`,
    actor_type: 'rider',
    actor_id: riderId,
  });

  return { ok: true, method: 'wallet', charge_id: idem, summary };
}

export async function createRiderCreditPromptPayCharge(pool, { userId, riderId, amountThb }) {
  const amountNum = Math.round(Number(amountThb) * 100) / 100;
  if (!(amountNum >= 1)) {
    throw Object.assign(new Error('amount_min_1_thb'), { code: 'amount_min_1_thb' });
  }
  if (!isPaysoEnabledFromEnv()) {
    throw Object.assign(new Error('payso_not_configured'), { code: 'payso_not_configured' });
  }

  const userUuid = await resolveUserUuid(pool, userId);
  if (!userUuid) throw Object.assign(new Error('user_not_found'), { code: 'user_not_found' });

  let customerEmail = 'noreply@aqond.local';
  try {
    const er = await pool.query('SELECT email FROM users WHERE id = $1::uuid LIMIT 1', [userUuid]);
    const em = er.rows?.[0]?.email;
    if (em && String(em).trim()) customerEmail = String(em).trim();
  } catch {
    /* default */
  }

  const amountMicro = riderMicroFromThb(amountNum);
  const pr = await createPaysoWalletDepositCharge({
    amountThb: amountNum,
    userUuid,
    customerEmail,
    productDetail: `Rider OS Credit Topup ${amountNum} THB`,
  });

  if (!pr.ok || !pr.payso_reference_id) {
    throw Object.assign(new Error(pr.error || 'payso_create_failed'), { code: 'payso_create_failed' });
  }

  const chargeId = pr.payso_reference_id;
  await pool.query(
    `INSERT INTO rider_credit_topup_charges
      (charge_id, user_id, rider_id, amount, amount_micro, status, payment_method)
     VALUES ($1, $2, $3, $4, $5, 'pending', 'promptpay')`,
    [chargeId, userUuid, riderId, amountNum, amountMicro],
  ).catch((e) => {
    if (e.code === '42P01') {
      throw Object.assign(new Error('rider_topup_table_missing'), { code: 'migration_required' });
    }
    throw e;
  });

  scheduleRiderCreditPaysoReconcile(pool, { chargeId });

  return {
    charge_id: chargeId,
    status: 'pending',
    amount: amountNum,
    amount_micro: amountMicro,
    currency: 'THB',
    qr_code_url: pr.qr_code_url || pr.qrCodeUrl || null,
    payment_method: 'promptpay',
    auto_reconcile: true,
  };
}

export async function fulfillRiderCreditTopupCharge(pool, { chargeId, transactionNoSuffix = '' }) {
  const row = await pool.query(
    `SELECT * FROM rider_credit_topup_charges WHERE charge_id = $1 LIMIT 1`,
    [String(chargeId)],
  );
  const rec = row.rows?.[0];
  if (!rec) return { ok: false, reason: 'charge_not_found' };
  if (String(rec.status).toLowerCase() === 'success') {
    const summary = await getRiderCreditSummary(pool, rec.rider_id, String(rec.user_id));
    return { ok: true, duplicate: true, summary };
  }

  const summary = await riderCreditTopup(pool, {
    rider_id: rec.rider_id,
    user_id: String(rec.user_id),
    amount_micro: Number(rec.amount_micro),
    reason: `เติมเครดิต PromptPay ฿${Number(rec.amount).toFixed(2)}`,
    actor_type: 'rider',
    actor_id: rec.rider_id,
  });

  await pool.query(
    `UPDATE rider_credit_topup_charges SET status = 'success', completed_at = NOW() WHERE charge_id = $1`,
    [String(chargeId)],
  );

  await pool.query(
    `INSERT INTO payment_ledger_audit
      (id, event_type, payment_id, gateway, job_id, amount, currency, status, bill_no, transaction_no, user_id, metadata)
     VALUES ($1, 'rider_credit_topup', $2, 'payso', $3, $4, 'THB', 'completed', $5, $6, $7, $8::jsonb)`,
    [
      `L-RIDER-CR-${crypto.randomUUID().slice(0, 8)}`,
      chargeId,
      rec.rider_id,
      Number(rec.amount),
      `RIDER-PP-${String(chargeId).slice(-8).toUpperCase()}`,
      transactionNoSuffix || `T-PP-${Date.now()}`,
      rec.user_id,
      JSON.stringify({ rider_id: rec.rider_id, amount_micro: rec.amount_micro, method: 'promptpay' }),
    ],
  ).catch(() => null);

  return { ok: true, summary, method: 'promptpay' };
}

export async function pollAndFulfillRiderCreditTopup(pool, chargeId) {
  const row = await pool.query(
    `SELECT * FROM rider_credit_topup_charges WHERE charge_id = $1 LIMIT 1`,
    [String(chargeId)],
  );
  const rec = row.rows?.[0];
  if (!rec) return { status: 'not_found' };
  if (String(rec.status).toLowerCase() === 'success') {
    const summary = await getRiderCreditSummary(pool, rec.rider_id, String(rec.user_id));
    return { status: 'success', paid: true, summary };
  }

  const q = await queryPaysoWalletDepositStatus({ referenceId: String(chargeId) });
  if (!q?.paid) {
    return {
      status: 'pending',
      paid: false,
      gateway_status: q?.status || null,
    };
  }

  const fulfilled = await fulfillRiderCreditTopupCharge(pool, {
    chargeId,
    transactionNoSuffix: String(q.transaction_id || Date.now()),
  });
  return {
    status: 'success',
    paid: true,
    summary: fulfilled.summary,
  };
}

/** PaySo webhook — call before wallet deposit credit */
export async function tryFulfillRiderCreditPaysoWebhook(pool, referenceId, normalized) {
  const row = await pool.query(
    `SELECT charge_id FROM rider_credit_topup_charges WHERE charge_id = $1 LIMIT 1`,
    [String(referenceId)],
  ).catch(() => ({ rows: [] }));
  if (!row.rows?.[0]) return null;

  const st = String(normalized?.status || '').toLowerCase();
  const fail = ['failed', 'cancel', 'cancelled', 'expired', 'void'];
  if (fail.includes(st)) {
    await pool.query(
      `UPDATE rider_credit_topup_charges SET status = 'failed' WHERE charge_id = $1 AND status = 'pending'`,
      [String(referenceId)],
    ).catch(() => null);
    return { ok: true, ignored: 'failure_status' };
  }

  return fulfillRiderCreditTopupCharge(pool, {
    chargeId: String(referenceId),
    transactionNoSuffix: String(normalized?.transaction_id || Date.now()),
  });
}
