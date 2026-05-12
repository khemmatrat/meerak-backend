/**
 * Hybrid wallet deposit — manual slip vs PaySo / Ksher QR (payment_ledger_audit + wallet_transactions).
 */
import { calcDepositFeeBreakdown } from './aqondPayFees.js';
import { nextThursdayAfterTodayBangkokYmd } from './thailandDates.js';

const GROSS_AMOUNT_EPSILON = 0.02;

/**
 * @param {import('pg').Pool} pool
 * @param {object} p
 * @param {string} p.ledgerId
 * @param {string} p.userId uuid
 * @param {'MANUAL'|'PAYSO'} p.fundingSource
 * @param {'RECEIVED'|'PENDING_SETTLEMENT'} p.settlementStatus
 */
export async function insertWalletTransactionRecord(pool, p) {
  await pool.query(
    `INSERT INTO wallet_transactions (ledger_id, user_id, funding_source, settlement_status, is_withdrawable, available_on, net_amount_thb)
     VALUES ($1, $2::uuid, $3, $4, $5, $6, $7)
     ON CONFLICT (ledger_id) DO NOTHING`,
    [
      p.ledgerId,
      p.userId,
      p.fundingSource,
      p.settlementStatus,
      p.isWithdrawable ?? true,
      p.availableOn ?? null,
      p.netAmountThb ?? null,
    ]
  );
}

/**
 * Same transaction as caller. Locks wallet_deposit_charges row (FOR UPDATE).
 * PaySo/Ksher: bump users.wallet_balance by net only (withdrawable unchanged),
 * append payment_ledger_audit + wallet_transactions (PENDING_SETTLEMENT / not withdrawable).
 *
 * @param {import('pg').PoolClient} client
 * @param {{ userId: string, chargeId: string, grossAmount: number, transactionNoSuffix?: string }} p
 */
export async function creditWalletDepositPaysoTx(client, {
  userId,
  chargeId,
  grossAmount,
  transactionNoSuffix = '',
}) {
  const run = async (stage, sql, params) => {
    try {
      return await client.query(sql, params);
    } catch (e) {
      const err = new Error(`creditWalletDepositPaysoTx:${stage}:${e?.message || e}`);
      err.code = e?.code || err.code;
      err.cause = e;
      throw err;
    }
  };
  const cq = await client.query(
    `SELECT charge_id, user_id, amount, status,
            COALESCE(source_type, 'promptpay') AS source_type
       FROM wallet_deposit_charges
       WHERE charge_id = $1
       FOR UPDATE`,
    [chargeId]
  );
  const charge = cq.rows[0] || null;
  if (!charge) {
    const e = new Error('wallet_deposit_charge_not_found');
    e.code = 'WALLET_DEPOSIT_CHARGE_NOT_FOUND';
    e.nonRetryable = true;
    throw e;
  }

  const chargeUserId = String(charge.user_id || '').trim();
  if (!chargeUserId || chargeUserId !== String(userId || '').trim()) {
    const e = new Error('wallet_deposit_user_mismatch');
    e.code = 'WALLET_DEPOSIT_USER_MISMATCH';
    e.nonRetryable = true;
    throw e;
  }

  const expectedGross = Number(charge.amount);
  if (
    !Number.isFinite(expectedGross) ||
    Math.abs(expectedGross - Number(grossAmount)) > GROSS_AMOUNT_EPSILON
  ) {
    const e = new Error('wallet_deposit_gross_mismatch');
    e.code = 'WALLET_DEPOSIT_GROSS_MISMATCH';
    e.nonRetryable = true;
    throw e;
  }

  const stRaw = String(charge.source_type || 'promptpay').toLowerCase();
  const auditGateway = stRaw === 'ksher' ? 'ksher' : 'payso';
  const feeSourceKey = stRaw === 'ksher' ? 'ksher' : 'payso';

  if (charge.status === 'success') {
    return {
      alreadyCredited: true,
      ledgerId: charge.ledger_id || null,
      creditAmount: null,
      billNo: null,
      txnNo: null,
      available_on: null,
      auditGateway,
    };
  }

  const feeBreakdown = calcDepositFeeBreakdown(grossAmount, feeSourceKey);
  const creditAmount = feeBreakdown.net_to_wallet;
  const ledgerId = `L-deposit-payso-${chargeId}-${Date.now()}`;
  const billNo = `DEP-${chargeId}`;
  const txnNo = `T-DEP-${chargeId}-${transactionNoSuffix || Date.now()}`;
  const availableOn = nextThursdayAfterTodayBangkokYmd();

  await run(
    'users_wallet_balance_increment',
    'UPDATE users SET wallet_balance = wallet_balance + $1, updated_at = NOW() WHERE id = $2::uuid',
    [creditAmount, userId]
  );
  await run(
    'insert_payment_ledger_audit',
    `INSERT INTO payment_ledger_audit (
       id, event_type, payment_id, gateway, job_id,
       amount, currency, status, bill_no, transaction_no, user_id,
       gateway_fee_amount, platform_margin_amount, net_amount, metadata
     )
     VALUES ($1, 'wallet_deposit', $2, $3, $2, $4, 'THB', 'completed', $5, $6, $7, $8, $9, $10, $11)`,
    [
      ledgerId,
      chargeId,
      auditGateway,
      grossAmount,
      billNo,
      txnNo,
      userId,
      feeBreakdown.gateway_fee_amount ?? null,
      feeBreakdown.platform_margin_amount ?? null,
      creditAmount,
      JSON.stringify({
        leg: 'wallet_deposit',
        charge_id: chargeId,
        gateway: auditGateway,
        source_type: stRaw,
        gross_amount: grossAmount,
        net_to_wallet: creditAmount,
        funding_source: 'PAYSO',
        settlement_status: 'PENDING_SETTLEMENT',
        available_on: availableOn,
        is_withdrawable: false,
      }),
    ]
  );
  await run(
    'insert_wallet_transactions',
    `INSERT INTO wallet_transactions (ledger_id, user_id, funding_source, settlement_status, is_withdrawable, available_on, net_amount_thb)
     VALUES ($1, $2::uuid, $3, $4, false, $5::date, $6)
     ON CONFLICT (ledger_id) DO NOTHING`,
    [ledgerId, userId, 'PAYSO', 'PENDING_SETTLEMENT', availableOn, creditAmount]
  );

  if (feeBreakdown.platform_margin_amount > 0) {
    await client.query('SAVEPOINT sp_platform_revenue_optional');
    try {
      const revSource =
        auditGateway === 'ksher'
          ? 'deposit_margin_ksher'
          : 'deposit_margin_payso';
      await run(
        'insert_platform_revenues',
        `INSERT INTO platform_revenues (
           transaction_id, source_type, amount, gross_amount, gateway_fee_amount, metadata
         )
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          ledgerId,
          revSource,
          feeBreakdown.platform_margin_amount,
          grossAmount,
          feeBreakdown.gateway_fee_amount,
          JSON.stringify({
            charge_id: chargeId,
            source_type: stRaw,
            gateway: auditGateway,
          }),
        ]
      );
      await client.query('RELEASE SAVEPOINT sp_platform_revenue_optional');
    } catch (e) {
      // If optional table/constraint fails, keep main credit transaction healthy.
      await client.query('ROLLBACK TO SAVEPOINT sp_platform_revenue_optional').catch(() => {});
      await client.query('RELEASE SAVEPOINT sp_platform_revenue_optional').catch(() => {});
      try {
        console.warn('[walletDepositHybrid] optional platform_revenues insert skipped:', e?.message || e);
      } catch {}
    }
  }

  await run(
    'update_wallet_deposit_charges_success',
    `UPDATE wallet_deposit_charges
     SET status = 'success', completed_at = NOW(), ledger_id = $1
     WHERE charge_id = $2`,
    [ledgerId, chargeId]
  );

  return {
    alreadyCredited: false,
    ledgerId,
    creditAmount,
    billNo,
    txnNo,
    available_on: availableOn,
    auditGateway,
  };
}

/**
 * Credit user wallet + ledger for PaySo deposit (standalone transaction).
 * @param {import('pg').Pool} pool
 */
export async function creditWalletDepositFromPayso(pool, {
  userId,
  chargeId,
  grossAmount,
  transactionNoSuffix = '',
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await creditWalletDepositPaysoTx(client, {
      userId,
      chargeId,
      grossAmount,
      transactionNoSuffix,
    });
    await client.query('COMMIT');
    if (r.alreadyCredited) {
      return {
        duplicate: true,
        ledgerId: r.ledgerId,
        available_on: r.available_on,
      };
    }
    return {
      ledgerId: r.ledgerId,
      creditAmount: r.creditAmount,
      billNo: r.billNo,
      txnNo: r.txnNo,
      available_on: r.available_on,
    };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * After admin approves manual_deposits row — withdrawable immediate.
 */
export async function creditWalletDepositFromManualApproval(pool, {
  userId,
  manualDepositId,
  grossAmount,
  reviewedBy,
  bankRefId,
}) {
  const feeBreakdown = calcDepositFeeBreakdown(grossAmount, 'manual');
  const creditAmount = feeBreakdown.net_to_wallet;
  const ledgerId = `L-deposit-manual-${manualDepositId}-${Date.now()}`;
  const chargeId = `manual_${manualDepositId}`;
  const billNo = `DEP-M-${manualDepositId}`;
  const txnNo = `T-DEP-M-${manualDepositId}-${Date.now()}`;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pend = await client.query(
      `SELECT id FROM manual_deposits
       WHERE id = $1::uuid AND status = 'manual_pending_verification'
       FOR UPDATE`,
      [manualDepositId]
    );
    if (!pend.rows?.length) {
      await client.query('ROLLBACK');
      const err = new Error('manual_deposit_not_pending_or_missing');
      err.code = 'MANUAL_DEPOSIT_INVALID';
      throw err;
    }
    await client.query(
      `UPDATE users SET wallet_balance = wallet_balance + $1,
           wallet_balance_withdrawable = COALESCE(wallet_balance_withdrawable, 0) + $1,
           updated_at = NOW()
       WHERE id = $2::uuid`,
      [creditAmount, userId]
    );
    await client.query(
      `INSERT INTO payment_ledger_audit (
         id, event_type, payment_id, gateway, job_id,
         amount, currency, status, bill_no, transaction_no, user_id,
         gateway_fee_amount, platform_margin_amount, net_amount, metadata
       )
       VALUES ($1, 'wallet_deposit', $2, 'bank_transfer', $2, $3, 'THB', 'completed', $4, $5, $6, $7, $8, $9, $10)`,
      [
        ledgerId,
        chargeId,
        grossAmount,
        billNo,
        txnNo,
        userId,
        feeBreakdown.gateway_fee_amount ?? null,
        feeBreakdown.platform_margin_amount ?? null,
        creditAmount,
        JSON.stringify({
          leg: 'wallet_deposit',
          manual_deposit_id: manualDepositId,
          source_type: 'manual',
          funding_source: 'MANUAL',
          settlement_status: 'RECEIVED',
          is_withdrawable: true,
        }),
      ]
    );
    await client.query(
      `INSERT INTO wallet_transactions (ledger_id, user_id, funding_source, settlement_status, is_withdrawable, available_on, net_amount_thb)
       VALUES ($1, $2::uuid, $3, $4, true, NULL, $5)
       ON CONFLICT (ledger_id) DO NOTHING`,
      [ledgerId, userId, 'MANUAL', 'RECEIVED', creditAmount]
    );
    await client.query(
      `UPDATE manual_deposits
       SET status = 'approved',
           ledger_id = $2,
           reviewed_at = NOW(),
           reviewed_by = $3,
           bank_ref_id = COALESCE($4, bank_ref_id)
       WHERE id = $1::uuid`,
      [manualDepositId, ledgerId, reviewedBy || 'admin', bankRefId || null]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }

  return { ledgerId, creditAmount, billNo, txnNo };
}
