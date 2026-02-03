/**
 * Wallet service: single source of truth = PostgreSQL ledger.
 * Double-entry, append-only, idempotent. Balance derived from ledger (updated in same tx).
 */
import { PoolClient } from "pg";
import { getPool } from "../store";
import {
  getWithdrawalFeeForNet,
  getMaxNetWithdrawable,
  MIN_WITHDRAWAL_THB,
  MAX_WITHDRAWAL_THB,
  type WithdrawChannel,
} from "./walletFee";

const CURRENCY = "THB";
const SYSTEM_BANK_IN = "BANK_IN";
const SYSTEM_BANK_OUT = "BANK_OUT";
const SYSTEM_FEE_REVENUE = "FEE_REVENUE";

function round(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface WalletRow {
  id: string;
  user_id: string;
  currency: string;
  balance: number;
  last_ledger_id: number | null;
}

export async function getOrCreateWallet(
  client: PoolClient,
  userId: string,
): Promise<WalletRow> {
  await client.query(
    `INSERT INTO wallets (user_id, currency, balance, last_ledger_id, updated_at)
     VALUES ($1, $2, 0, NULL, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id, currency) DO NOTHING`,
    [userId, CURRENCY],
  );
  const r = await client.query(
    `SELECT id, user_id, currency,
            (balance)::float AS balance,
            last_ledger_id
     FROM wallets WHERE user_id = $1 AND currency = $2`,
    [userId, CURRENCY],
  );
  if (r.rows.length === 0)
    throw new Error("Wallet not found after getOrCreate");
  const row = r.rows[0];
  return {
    id: row.id,
    user_id: row.user_id,
    currency: row.currency,
    balance: parseFloat(row.balance),
    last_ledger_id: row.last_ledger_id,
  };
}

export interface TopupResult {
  balance: number;
  transaction_group_id: string;
}

export async function topup(
  idempotencyKey: string,
  userId: string,
  amount: number,
  gateway: string,
  paymentId: string,
  billNo: string,
  transactionNo: string,
  actorId?: string,
): Promise<TopupResult> {
  const pool = getPool();
  if (!pool) throw new Error("Database unavailable");
  const amt = round(amount);
  if (amt <= 0) throw new Error("Amount must be positive");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(
      `SELECT response_snapshot FROM idempotency_keys WHERE idempotency_key = $1`,
      [idempotencyKey],
    );
    if (existing.rows.length > 0) {
      await client.query("ROLLBACK");
      const snap = existing.rows[0].response_snapshot;
      return {
        balance: snap.balance,
        transaction_group_id: snap.transaction_group_id,
      };
    }

    const wallet = await getOrCreateWallet(client, userId);
    const groupId = uuid();
    const newBalance = round(wallet.balance + amt);

    const leg1Key = `${idempotencyKey}_leg1`;
    const leg2Key = `${idempotencyKey}_leg2`;
    await client.query(
      `INSERT INTO ledger_entries (
        idempotency_key, transaction_group_id, event_type, direction, amount, currency,
        wallet_id, user_id, system_account_code, balance_after, description,
        gateway, payment_id, transaction_no, bill_no, created_by
      ) VALUES ($1, $2, 'topup', 'debit', $3, $4, NULL, NULL, $5, NULL, $6, $7, $8, $9, $10, $11)`,
      [
        leg1Key,
        groupId,
        amt,
        CURRENCY,
        SYSTEM_BANK_IN,
        `Deposit ${amt} THB via ${gateway}`,
        gateway,
        paymentId,
        transactionNo,
        billNo,
        actorId || userId,
      ],
    );
    await client.query(
      `INSERT INTO ledger_entries (
        idempotency_key, transaction_group_id, event_type, direction, amount, currency,
        wallet_id, user_id, system_account_code, balance_after, description,
        gateway, payment_id, transaction_no, bill_no, created_by
      ) VALUES ($1, $2, 'topup', 'credit', $3, $4, $5, $6, NULL, $7, $8, $9, $10, $11, $12, $13)`,
      [
        leg2Key,
        groupId,
        amt,
        CURRENCY,
        wallet.id,
        userId,
        newBalance,
        `Credit user wallet ${amt} THB`,
        gateway,
        paymentId,
        transactionNo,
        billNo,
        actorId || userId,
      ],
    );

    await client.query(
      `UPDATE wallets SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [newBalance, wallet.id],
    );

    const responseSnapshot = {
      balance: newBalance,
      transaction_group_id: groupId,
    };
    await client.query(
      `INSERT INTO idempotency_keys (idempotency_key, transaction_group_id, operation, response_snapshot)
       VALUES ($1, $2, 'topup', $3)`,
      [idempotencyKey, groupId, JSON.stringify(responseSnapshot)],
    );

    await client.query(
      `INSERT INTO financial_audit_log (actor_type, actor_id, action, entity_type, entity_id, state_after, reason, correlation_id)
       VALUES ('user', $1, 'WALLET_TOPUP', 'wallet', $2, $3, $4, $5)`,
      [
        actorId || userId,
        wallet.id,
        JSON.stringify({
          balance_before: wallet.balance,
          balance_after: newBalance,
          amount: amt,
          gateway,
          payment_id: paymentId,
        }),
        `Deposit ${amt} THB via ${gateway}`,
        groupId,
      ],
    );

    await client.query("COMMIT");
    return { balance: newBalance, transaction_group_id: groupId };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export interface WithdrawResult {
  balance: number;
  transaction_group_id: string;
  fee_thb: number;
  net_amount: number;
}

export async function withdraw(
  idempotencyKey: string,
  userId: string,
  amountNet: number,
  channel: WithdrawChannel,
  bankInfo: string,
  actorId?: string,
): Promise<WithdrawResult> {
  const pool = getPool();
  if (!pool) throw new Error("Database unavailable");
  const net = round(amountNet);
  if (net < MIN_WITHDRAWAL_THB)
    throw new Error(`Minimum withdrawal is ${MIN_WITHDRAWAL_THB} THB`);
  const feeThb = getWithdrawalFeeForNet(channel, net);
  const total = round(net + feeThb);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT response_snapshot FROM idempotency_keys WHERE idempotency_key = $1`,
      [idempotencyKey],
    );
    if (existing.rows.length > 0) {
      await client.query("ROLLBACK");
      const snap = existing.rows[0].response_snapshot;
      return {
        balance: snap.balance,
        transaction_group_id: snap.transaction_group_id,
        fee_thb: snap.fee_thb,
        net_amount: snap.net_amount,
      };
    }

    const wallet = await getOrCreateWallet(client, userId);
    const maxNet = getMaxNetWithdrawable(wallet.balance, channel);
    if (net > maxNet)
      throw new Error(`Max net withdrawable for this channel is ${maxNet} THB`);
    if (wallet.balance < total)
      throw new Error("Insufficient balance for withdrawal + fee");

    const groupId = uuid();
    const newBalance = round(wallet.balance - total);

    const leg1Key = `${idempotencyKey}_leg1`;
    const leg2Key = `${idempotencyKey}_leg2`;
    const leg3Key = `${idempotencyKey}_leg3`;
    await client.query(
      `INSERT INTO ledger_entries (
        idempotency_key, transaction_group_id, event_type, direction, amount, currency,
        wallet_id, user_id, system_account_code, balance_after, description, created_by, metadata
      ) VALUES ($1, $2, 'withdrawal', 'debit', $3, $4, $5, $6, NULL, $7, $8, $9, $10)`,
      [
        leg1Key,
        groupId,
        total,
        CURRENCY,
        wallet.id,
        userId,
        newBalance,
        `Withdrawal ${total} THB (net ${net} + fee ${feeThb}) via ${channel}`,
        actorId || userId,
        JSON.stringify({ channel, bank_info: bankInfo }),
      ],
    );
    await client.query(
      `INSERT INTO ledger_entries (
        idempotency_key, transaction_group_id, event_type, direction, amount, currency,
        wallet_id, user_id, system_account_code, balance_after, description, created_by, metadata
      ) VALUES ($1, $2, 'withdrawal', 'credit', $3, $4, NULL, NULL, $5, NULL, $6, $7, $8)`,
      [
        leg2Key,
        groupId,
        net,
        CURRENCY,
        SYSTEM_BANK_OUT,
        `Payout ${net} THB to user`,
        actorId || userId,
        JSON.stringify({ bank_info: bankInfo }),
      ],
    );
    await client.query(
      `INSERT INTO ledger_entries (
        idempotency_key, transaction_group_id, event_type, direction, amount, currency,
        wallet_id, user_id, system_account_code, balance_after, description, created_by, metadata
      ) VALUES ($1, $2, 'withdrawal', 'credit', $3, $4, NULL, NULL, $5, NULL, $6, $7, $8)`,
      [
        leg3Key,
        groupId,
        feeThb,
        CURRENCY,
        SYSTEM_FEE_REVENUE,
        `Platform fee ${feeThb} THB (${channel})`,
        actorId || userId,
        JSON.stringify({ channel }),
      ],
    );

    await client.query(
      `UPDATE wallets SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [newBalance, wallet.id],
    );

    const responseSnapshot = {
      balance: newBalance,
      transaction_group_id: groupId,
      fee_thb: feeThb,
      net_amount: net,
    };
    await client.query(
      `INSERT INTO idempotency_keys (idempotency_key, transaction_group_id, operation, response_snapshot)
       VALUES ($1, $2, 'withdrawal', $3)`,
      [idempotencyKey, groupId, JSON.stringify(responseSnapshot)],
    );

    await client.query(
      `INSERT INTO financial_audit_log (actor_type, actor_id, action, entity_type, entity_id, state_before, state_after, reason, correlation_id)
       VALUES ('user', $1, 'WALLET_WITHDRAW', 'wallet', $2, $3, $4, $5, $6)`,
      [
        actorId || userId,
        wallet.id,
        JSON.stringify({ balance_before: wallet.balance }),
        JSON.stringify({
          balance_after: newBalance,
          net_amount: net,
          fee_thb: feeThb,
          channel,
          bank_info: bankInfo,
        }),
        `Withdrawal net ${net} + fee ${feeThb} via ${channel}`,
        groupId,
      ],
    );

    await client.query("COMMIT");
    return {
      balance: newBalance,
      transaction_group_id: groupId,
      fee_thb: feeThb,
      net_amount: net,
    };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function getBalance(userId: string): Promise<{ balance: number }> {
  const pool = getPool();
  if (!pool) throw new Error("Database unavailable");
  const client = await pool.connect();
  try {
    const w = await getOrCreateWallet(client, userId);
    return { balance: w.balance };
  } finally {
    client.release();
  }
}
