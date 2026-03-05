/**
 * AqondPay Fee Logic — Double-Side VIP
 * Phase 2: Financial Core
 *
 * Client Side (Platform Fee): 8% General, 6% Silver, 5% Gold, 4% Platinum
 * Partner Match/Board (Commission): 24% Non-VIP, 18% Silver, 15% Gold, 12% Platinum
 * Partner Booking (Commission): 32% Non-VIP, 18% Silver, 15% Gold, 12% Platinum
 *
 * Deposit (Wallet Top-up):
 * - total_fee: % ที่หักจากผู้ใช้ (รวม margin)
 * - gateway_cost: % ที่ Omise หักจากเรา
 * - PromptPay: 0% (แนะนำ — รับเต็มจำนวน), เรารับภาระ Omise 1.65%
 * - TrueMoney: 2.85% (gateway 2.65% + margin 0.2%)
 * - Credit Card: 3.95% (gateway 3.65% + margin 0.3%)
 */

const DEPOSIT_CONFIG = {
  promptpay: { total_fee: 0, gateway_cost: 0.0165 },
  truemoney: { total_fee: 0.0285, gateway_cost: 0.0265 },
  card: { total_fee: 0.0395, gateway_cost: 0.0365 }
};

/**
 * คำนวณยอดเติมเงิน: net_to_wallet, gateway_fee, platform_margin
 * @param {number} grossAmount - จำนวนที่ผู้ใช้จ่าย (บาท)
 * @param {string} sourceType - promptpay | truemoney | card
 * @returns {{ net_to_wallet, gateway_fee_amount, platform_margin_amount }}
 */
function calcDepositFeeBreakdown(grossAmount, sourceType) {
  const cfg = DEPOSIT_CONFIG[(sourceType || 'promptpay').toLowerCase()] || DEPOSIT_CONFIG.promptpay;
  const gatewayFeeAmount = Math.round(grossAmount * cfg.gateway_cost * 100) / 100;
  const totalFeeAmount = Math.round(grossAmount * cfg.total_fee * 100) / 100;
  const netToWallet = Math.round((grossAmount - totalFeeAmount) * 100) / 100;
  const platformMarginAmount = Math.round((totalFeeAmount - gatewayFeeAmount) * 100) / 100;
  return {
    net_to_wallet: netToWallet,
    gateway_fee_amount: gatewayFeeAmount,
    platform_margin_amount: platformMarginAmount,
    total_fee_amount: totalFeeAmount
  };
}

const PLATFORM_FEE = {
  none: 0.08,
  silver: 0.06,
  gold: 0.05,
  platinum: 0.04
};

const COMMISSION_MATCH_BOARD = {
  none: 0.24,
  silver: 0.18,
  gold: 0.15,
  platinum: 0.12
};

const COMMISSION_BOOKING = {
  none: 0.32,
  silver: 0.18,
  gold: 0.15,
  platinum: 0.12
};

const VIP_ADMIN_SIPHON_PERCENT = 12.5; // 12.5% of gross profit → vip_admin_fund

function normalizeTier(tier) {
  const t = (tier || 'none').toString().toLowerCase().trim();
  return ['silver', 'gold', 'platinum'].includes(t) ? t : 'none';
}

/**
 * Get platform fee rate for client (based on client VIP tier)
 * @param {string} clientVipTier - none|silver|gold|platinum
 * @returns {number} 0.06-0.08
 */
function getPlatformFeeRate(clientVipTier) {
  return PLATFORM_FEE[normalizeTier(clientVipTier)] ?? 0.08;
}

/**
 * Get commission rate for Match or Job Board (based on partner/provider VIP tier)
 * @param {string} partnerVipTier - none|silver|gold|platinum
 * @returns {number} 0.12-0.24
 */
function getCommissionMatchBoard(partnerVipTier) {
  return COMMISSION_MATCH_BOARD[normalizeTier(partnerVipTier)] ?? 0.24;
}

/**
 * Get commission rate for Booking (based on partner/provider VIP tier)
 * @param {string} partnerVipTier - none|silver|gold|platinum
 * @returns {number} 0.12-0.32
 */
function getCommissionBooking(partnerVipTier) {
  return COMMISSION_BOOKING[normalizeTier(partnerVipTier)] ?? 0.32;
}

/**
 * Calculate platform fee amount (client side)
 */
function calcPlatformFee(amount, clientVipTier) {
  const rate = getPlatformFeeRate(clientVipTier);
  return Math.round(amount * rate * 100) / 100;
}

/**
 * Calculate commission for Match/Board job
 */
function calcCommissionMatchBoard(amount, partnerVipTier) {
  const rate = getCommissionMatchBoard(partnerVipTier);
  return Math.round(amount * rate * 100) / 100;
}

/**
 * Calculate commission for Booking
 */
function calcCommissionBooking(amount, partnerVipTier) {
  const rate = getCommissionBooking(partnerVipTier);
  return Math.round(amount * rate * 100) / 100;
}

/**
 * VIP Admin Fund: 12.5% of gross profit from VIP transactions
 * @param {number} grossProfit - platform commission/fee received
 * @param {string} vipTier - silver|gold|platinum (must be VIP to siphon)
 * @returns {number} amount to siphon into vip_admin_fund
 */
function calcVipAdminFundSiphon(grossProfit, vipTier) {
  const t = normalizeTier(vipTier);
  if (t === 'none') return 0;
  if (grossProfit <= 0) return 0;
  const siphon = grossProfit * (VIP_ADMIN_SIPHON_PERCENT / 100);
  return Math.round(siphon * 100) / 100;
}

export {
  DEPOSIT_CONFIG,
  calcDepositFeeBreakdown,
  PLATFORM_FEE,
  COMMISSION_MATCH_BOARD,
  COMMISSION_BOOKING,
  VIP_ADMIN_SIPHON_PERCENT,
  getPlatformFeeRate,
  getCommissionMatchBoard,
  getCommissionBooking,
  calcPlatformFee,
  calcCommissionMatchBoard,
  calcCommissionBooking,
  calcVipAdminFundSiphon,
  normalizeTier
};
