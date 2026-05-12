/**
 * Outbound wallet withdrawal fee for payout_requests only.
 * Not used for deposits, job fees, commissions, or other ledger legs.
 */

const TRUEMONEY_RATE_PCT = 3.6;

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * @param {object} p
 * @param {number} p.amountGrossThb - จำนวนที่ขอถอน (ก่อนหักค่าธรรมเนียม สำหรับคิด % TrueMoney)
 * @param {string} [p.channelRaw] - bank_details.channel: promptpay | bank_transfer | truemoney
 * @param {boolean} p.isProvider - users.role === 'provider'
 * @param {boolean} p.instantPayout - เฉพาะ provider: ถอนทันที
 * @param {number} [p.feeStandardThb] - จาก payout_config (admin)
 * @param {number} [p.feeInstantThb] - จาก payout_config (admin)
 * @returns {number}
 */
export function computePayoutWithdrawalFeeThb({
  amountGrossThb,
  channelRaw,
  isProvider,
  instantPayout,
  feeStandardThb = 35,
  feeInstantThb = 50,
}) {
  const std = Number(feeStandardThb) || 35;
  const inst = Number(feeInstantThb) || 50;
  if (isProvider) {
    return instantPayout ? inst : std;
  }
  const ch = String(channelRaw || '').toLowerCase().trim();
  if (ch === 'truemoney') {
    return round2((Math.max(0, Number(amountGrossThb) || 0) * TRUEMONEY_RATE_PCT) / 100);
  }
  return std;
}
