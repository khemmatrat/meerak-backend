/**
 * Wallet Topup Handler (business action contract).
 *
 * Branches:
 *   A) wallet_deposit_charges exists and source is payso|ksher → hybrid path
 *      (users.wallet_balance, payment_ledger_audit, wallet_transactions PENDING_SETTLEMENT)
 *      via creditWalletDepositPaysoTx — withdrawable rules unchanged (release cron).
 *   B) Else → Payment Core: ledger_entries WALLET_CREDIT + payment_wallet_claims + wallets.balance.
 *
 * Idempotency:
 *   - A: charge already success → empty domainEvents
 *   - B: ledger ON CONFLICT returns no row → no wallet bump / no events
 */

import { creditWalletDepositPaysoTx } from '../walletDepositHybrid.js';

const MIN_TOPUP_THB = 100;
const AMT_EPS_THB = 0.02;

function toStr(v) {
  const s = String(v ?? '').trim();
  return s || null;
}

function payMeta(payment) {
  const m = payment?.metadata;
  return m && typeof m === 'object' && !Array.isArray(m) ? m : {};
}

/** @param {object} payment @param {object} normalized */
export function resolveWalletTopupUserId(payment, normalized) {
  const md = payMeta(payment);
  return (
    toStr(md.user_id) ||
    toStr(payment?.user_id) ||
    toStr(payment?.client_reference_id) ||
    toStr(normalized?.client_reference_id)
  );
}

/** @param {object} payment @param {object} normalized */
function collectChargeIdCandidates(payment, normalized) {
  const md = payMeta(payment);
  const raw = [
    md.deposit_charge_id,
    md.wallet_deposit_charge_id,
    md.charge_id,
    payment?.external_ref,
    payment?.merchant_reference,
    normalized?.payment_id,
  ];
  const out = [];
  const seen = new Set();
  for (const x of raw) {
    const s = toStr(x);
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

function isPendingSettlementSourceType(st) {
  const s = String(st || 'promptpay').toLowerCase();
  return s === 'payso' || s === 'ksher';
}

async function isWalletFrozenTx(client, userId) {
  if (!userId) return false;
  const r = await client.query(
    `SELECT wallet_frozen, account_status
     FROM users
     WHERE id::text = $1
        OR firebase_uid = $1
        OR phone = $1
     LIMIT 1`,
    [String(userId)]
  );
  const u = r.rows?.[0];
  if (!u) return false;
  return !!(u.wallet_frozen || u.account_status === 'suspended' || u.account_status === 'banned');
}

async function peekDepositChargeRow(client, payment, normalized) {
  for (const chargeId of collectChargeIdCandidates(payment, normalized)) {
    const r = await client.query(
      `SELECT charge_id, user_id, amount, status,
              COALESCE(source_type, 'promptpay') AS source_type
         FROM wallet_deposit_charges WHERE charge_id = $1 LIMIT 1`,
      [chargeId]
    );
    if (r.rows?.[0]) return { charge: r.rows[0], chargeId };
  }
  return { charge: null, chargeId: null };
}

/**
 * @param {object} payment - gateway_transactions row (include metadata)
 * @param {object} normalized - normalized webhook event
 */
export async function validate(payment, normalized) {
  const amountMinor = Number(payment?.amount_minor || 0);
  const amountThb = amountMinor / 100;
  if (amountThb < MIN_TOPUP_THB) {
    return { ok: false, failure_code: 'wallet_topup_amount_too_small' };
  }

  const userId = resolveWalletTopupUserId(payment, normalized || {});
  if (!userId) {
    return { ok: false, failure_code: 'wallet_topup_missing_user' };
  }

  const gwGross = amountThb;
  if (normalized?.amount != null && Number.isFinite(Number(normalized.amount))) {
    const n = Number(normalized.amount);
    if (Math.abs(n - gwGross) > AMT_EPS_THB) {
      return { ok: false, failure_code: 'wallet_topup_webhook_amount_mismatch' };
    }
  }

  return { ok: true };
}

/**
 * @param {import('pg').PoolClient} client
 * @param {object} payment
 * @param {object} normalized
 */
export async function execute(client, payment, normalized) {
  const normalizedSafe = normalized || {};
  const paymentStableId =
    toStr(payment?.external_ref) ||
    toStr(normalizedSafe?.payment_id) ||
    (payment?.id != null ? String(payment.id) : null);

  const userId = resolveWalletTopupUserId(payment, normalizedSafe);
  const amountMinor = Number(payment?.amount_minor || 0);
  const grossThb = amountMinor / 100;
  const currency = String(payment?.currency || 'THB').toUpperCase();
  const traceId = toStr(normalizedSafe?.trace_id) || toStr(payment?.trace_id);

  if (await isWalletFrozenTx(client, userId)) {
    return { ledger: null, domainEvents: [], skipped: true, reason: 'wallet_frozen' };
  }

  const { charge, chargeId } = await peekDepositChargeRow(client, payment, normalizedSafe);
  const hybrid =
    charge &&
    isPendingSettlementSourceType(charge.source_type) &&
    chargeId;

  if (hybrid) {
    if (String(charge.user_id || '').trim() !== String(userId || '').trim()) {
      const err = new Error('wallet_topup_deposit_charge_user_mismatch');
      err.code = 'WALLET_TOPUP_DEPOSIT_CHARGE_USER_MISMATCH';
      err.nonRetryable = true;
      throw err;
    }
    const expectedGross = Number(charge.amount);
    if (
      !Number.isFinite(expectedGross) ||
      Math.abs(expectedGross - grossThb) > AMT_EPS_THB
    ) {
      const err = new Error('wallet_topup_gross_mismatch');
      err.code = 'WALLET_TOPUP_GROSS_MISMATCH';
      err.nonRetryable = true;
      throw err;
    }

    let hybridRes;
    try {
      hybridRes = await creditWalletDepositPaysoTx(client, {
        userId,
        chargeId,
        grossAmount: grossThb,
        transactionNoSuffix: toStr(normalizedSafe?.event_id) || '',
      });
    } catch (e) {
      if (String(e?.code) === '42P01') {
        return { ledger: null, domainEvents: [], skipped: true, reason: 'wallet_deposit_tables_missing' };
      }
      throw e;
    }

    if (hybridRes.alreadyCredited) {
      return {
        ledger: hybridRes.ledgerId ? { id: hybridRes.ledgerId, kind: 'payment_ledger_audit' } : null,
        domainEvents: [],
        hybrid: { already_credited: true, charge_id: chargeId },
      };
    }

    const netMinor = Math.round(Number(hybridRes.creditAmount) * 100);
    const domainEvents = [
      {
        type: 'wallet.topup.completed',
        idempotency_key: String(paymentStableId || chargeId),
        payload: {
          user_id: userId,
          amount_minor: Math.round(grossThb * 100),
          net_amount_minor: netMinor,
          currency,
          payment_id: paymentStableId,
          charge_id: chargeId,
          ledger_audit_id: hybridRes.ledgerId,
          settlement_status: 'PENDING_SETTLEMENT',
          is_withdrawable: false,
          trace_id: traceId,
        },
        occurred_at: new Date().toISOString(),
      },
    ];

    return {
      ledger: {
        id: hybridRes.ledgerId,
        kind: 'payment_ledger_audit',
        net_to_wallet: hybridRes.creditAmount,
      },
      domainEvents,
      hybrid: true,
    };
  }

  const idempotencyKey = `wallet_topup:${paymentStableId}`;

  const ledger = await client.query(
    `INSERT INTO ledger_entries (
       idempotency_key, transaction_group_id, payment_id, user_id, event_type, direction, amount, currency,
       description, trace_id, created_at
     )
     VALUES ($1, gen_random_uuid(), $2, $3, $4, $5, $6::numeric, $7, $8, $9, NOW())
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING *`,
    [
      idempotencyKey,
      paymentStableId,
      userId,
      'WALLET_CREDIT',
      'credit',
      grossThb.toFixed(2),
      currency,
      `Wallet topup from payment ${paymentStableId}`,
      traceId,
    ]
  );

  const ledgerEntry = ledger.rows[0] || null;
  if (!ledgerEntry) {
    return { ledger: null, domainEvents: [] };
  }

  try {
    const wt = await client.query(
      `INSERT INTO payment_wallet_claims (
         payment_id, user_id, currency, ledger_entry_id, source, trace_id, metadata
       )
       VALUES ($1, $2, $3, $4, 'wallet_topup_handler', $5, '{}'::jsonb)
       ON CONFLICT (payment_id) DO NOTHING
       RETURNING id`,
      [String(paymentStableId), userId, currency, ledgerEntry.id, traceId]
    );
    if (!wt.rows.length) {
      const err = new Error('payment_wallet_claim_duplicate');
      err.code = 'PAYMENT_WALLET_CLAIM_DUPLICATE';
      err.nonRetryable = true;
      throw err;
    }
  } catch (e) {
    if (String(e?.code) === '42P01') {
      /* migration 188 not applied */
    } else {
      throw e;
    }
  }

  try {
    await client.query(
      `INSERT INTO wallets (user_id, currency, balance, updated_at)
       VALUES ($1, $2, $3::numeric, NOW())
       ON CONFLICT (user_id, currency) DO UPDATE
       SET balance = wallets.balance + EXCLUDED.balance,
           updated_at = NOW()`,
      [userId, currency, grossThb.toFixed(2)]
    );
  } catch (e) {
    if (String(e?.code) !== '42P01') throw e;
  }

  const domainEvents = [
    {
      type: 'wallet.topup.completed',
      idempotency_key: String(paymentStableId),
      payload: {
        user_id: userId,
        amount_minor: amountMinor,
        currency,
        payment_id: paymentStableId,
        ledger_entry_id: ledgerEntry.id,
        settlement_status: 'RECEIVED',
        is_withdrawable: true,
        trace_id: traceId,
      },
      occurred_at: new Date().toISOString(),
    },
  ];

  return { ledger: ledgerEntry, domainEvents };
}

export const walletTopupHandler = { validate, execute };
