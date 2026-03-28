/**
 * @fileoverview Immutable double-entry append for gateway_transactions (capture + settlement journals).
 */
import crypto from 'crypto';
import { LEDGER_ACCOUNTS } from './constants.js';

/**
 * Insert balanced debit/credit pair for a capture (funds held as merchant liability).
 * @param {import('pg').PoolClient} client
 * @param {{ gatewayTransactionId: string, amountMinor: number, currency?: string, journalLabel?: string }} p
 */
export async function appendCaptureJournal(client, p) {
  const journalId = crypto.randomUUID();
  const currency = (p.currency || 'THB').toUpperCase().slice(0, 3);
  const amt = Math.max(0, Math.floor(Number(p.amountMinor) || 0));
  if (amt <= 0) throw new Error('ledger_amount_invalid');

  await client.query(
    `INSERT INTO gateway_ledger_entries (
       journal_id, gateway_transaction_id, account_code, side, amount_minor, currency, description
     ) VALUES ($1, $2::uuid, $3, 'D', $4, $5, $6)`,
    [
      journalId,
      p.gatewayTransactionId,
      LEDGER_ACCOUNTS.ASSET_CLEARING,
      amt,
      currency,
      p.journalLabel || 'capture_clearing',
    ]
  );
  await client.query(
    `INSERT INTO gateway_ledger_entries (
       journal_id, gateway_transaction_id, account_code, side, amount_minor, currency, description
     ) VALUES ($1, $2::uuid, $3, 'C', $4, $5, $6)`,
    [
      journalId,
      p.gatewayTransactionId,
      LEDGER_ACCOUNTS.LIABILITY_MERCHANT_PAYABLE,
      amt,
      currency,
      p.journalLabel || 'capture_merchant_liability',
    ]
  );
}

/**
 * Settlement: move from merchant liability to cash asset (simplified).
 * @param {import('pg').PoolClient} client
 * @param {{ gatewayTransactionId: string, amountMinor: number, currency?: string }} p
 */
export async function appendSettlementJournal(client, p) {
  const journalId = crypto.randomUUID();
  const currency = (p.currency || 'THB').toUpperCase().slice(0, 3);
  const amt = Math.max(0, Math.floor(Number(p.amountMinor) || 0));
  if (amt <= 0) throw new Error('ledger_amount_invalid');

  await client.query(
    `INSERT INTO gateway_ledger_entries (
       journal_id, gateway_transaction_id, account_code, side, amount_minor, currency, description
     ) VALUES ($1, $2::uuid, $3, 'D', $4, $5, 'settlement_debit_liability')`,
    [journalId, p.gatewayTransactionId, LEDGER_ACCOUNTS.LIABILITY_MERCHANT_PAYABLE, amt, currency]
  );
  await client.query(
    `INSERT INTO gateway_ledger_entries (
       journal_id, gateway_transaction_id, account_code, side, amount_minor, currency, description
     ) VALUES ($1, $2::uuid, $3, 'C', $4, $5, 'settlement_credit_cash')`,
    [journalId, p.gatewayTransactionId, LEDGER_ACCOUNTS.ASSET_SETTLEMENT_CASH, amt, currency]
  );
}
