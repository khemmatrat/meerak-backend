/**
 * Payout withdrawal thresholds from payout_config (Admin Financial Dashboard).
 * Used only for payout eligibility, POST /api/payouts/request, and mobile display.
 */

import { normalizeWithdrawalFeePolicy } from './payoutWithdrawalFee.js';

const KEYS = [
  'withdrawal_min_jobs',
  'withdrawal_min_balance_thb',
  'withdrawal_fee_standard_thb',
  'withdrawal_fee_instant_thb',
  'withdrawal_fee_policy',
];

/**
 * @param {import('pg').Pool} pool
 * @returns {Promise<{
 *   withdrawal_min_jobs: number,
 *   withdrawal_min_balance_thb: number,
 *   withdrawal_fee_standard_thb: number,
 *   withdrawal_fee_instant_thb: number,
 *   min_payout_net_amount_thb: number,
 *   withdrawal_fee_policy: object,
 * }>}
 */
export async function getPayoutWithdrawalThresholds(pool) {
  const rows = await pool
    .query(
      `SELECT key, value_json FROM payout_config WHERE key = ANY($1::text[])`,
      [KEYS],
    )
    .catch(() => ({ rows: [] }));
  const map = {};
  for (const r of rows.rows || []) {
    let v = r.value_json;
    if (r.key === 'withdrawal_fee_policy') {
      map[r.key] = v;
      continue;
    }
    if (typeof v === 'string') {
      if (r.key === 'withdrawal_min_jobs') {
        v = parseInt(v, 10);
      } else {
        v = parseFloat(v);
      }
    }
    map[r.key] = v;
  }
  const withdrawal_min_jobs = parseInt(map.withdrawal_min_jobs, 10) || 10;
  const withdrawal_min_balance_thb = parseFloat(map.withdrawal_min_balance_thb) || 650;
  const withdrawal_fee_standard_thb = parseFloat(map.withdrawal_fee_standard_thb) || 35;
  const withdrawal_fee_instant_thb = parseFloat(map.withdrawal_fee_instant_thb) || 50;
  const min_payout_net_amount_thb = Math.max(
    0,
    Math.round((withdrawal_min_balance_thb - withdrawal_fee_standard_thb) * 100) / 100,
  );
  const withdrawal_fee_policy = normalizeWithdrawalFeePolicy(map.withdrawal_fee_policy || null, {
    withdrawal_fee_standard_thb,
    withdrawal_fee_instant_thb,
  });
  return {
    withdrawal_min_jobs,
    withdrawal_min_balance_thb,
    withdrawal_fee_standard_thb,
    withdrawal_fee_instant_thb,
    min_payout_net_amount_thb,
    withdrawal_fee_policy,
  };
}
