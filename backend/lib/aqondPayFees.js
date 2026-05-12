/**
 * AqondPay Fee Logic — Dynamic Fee Structure by VIP Tier
 *
 * Wallet deposit (PaySo / Ksher QR): ค่าธรรมเนียมรวม = MDR ขาเข้า (ตาม gateway จาก Payment Provider Gate) + Match markup %
 * (เดียวกับหน้า Admin Payment Provider Gate — getTransportMatchMarkupRate)
 *
 * Fee Structure (ตามที่เจ้านายสั่งเด็ดขาด):
 * | Tier    | Sourcing | Booking (เฉพาะหมวด) | Bidding |
 * |---------|----------|---------------------|---------|
 * | Normal  | 8%       | 32%                 | 9.3%    |
 * | Silver  | 8%       | 28%                 | 9.3%    |
 * | Gold    | 6%       | 24%                 | 8.3%    |
 * | Platinum| 6%       | 20%                 | 6.3%    |
 *
 * - Sourcing (ค่าจัดหา): ใช้ทุกประเภทงาน
 * - Booking: เฉพาะ Slot-based Booking เท่านั้น
 * - Bidding (ค่าบิดส่วนต่าง): ใช้กับ Match Board / Advance Jobs
 *
 * Deposit (Wallet Top-up): PromptPay 0%, TrueMoney 2.85%, Card 3.95%
 */

import {
  getInboundMdrDecimalForGatewayAndChannel,
  getLocalGatewayFromEnv,
  getTransportMatchMarkupRate,
  LOCAL_GATEWAY_KSHER,
} from './paymentProviderGate.js';

const DEPOSIT_CONFIG = {
  promptpay: { total_fee: 0, gateway_cost: 0.0165 },
  truemoney: { total_fee: 0.0285, gateway_cost: 0.0265 },
  card: { total_fee: 0.0395, gateway_cost: 0.0365 },
  bank_transfer: { total_fee: 0, gateway_cost: 0 },
  /** legacy static — dynamic path uses paymentProviderGate below */
  payso: { total_fee: 0.01, gateway_cost: 0.01 },
  manual: { total_fee: 0, gateway_cost: 0 },
};

function calcDepositFeeBreakdown(grossAmount, sourceType) {
  const st = (sourceType || 'promptpay').toLowerCase();
  /** PaySo / Ksher instant QR — MDR จริง + match markup จาก Gate (รวมถึง runtime PATCH) */
  if (st === 'payso' || st === 'ksher') {
    const gw = st === 'ksher' ? LOCAL_GATEWAY_KSHER : getLocalGatewayFromEnv();
    const mdr = getInboundMdrDecimalForGatewayAndChannel(gw, 'promptpay');
    const markup = getTransportMatchMarkupRate();
    const totalFeeRate = Math.min(0.5, Math.max(0, Number(mdr) + Number(markup)));
    const gatewayFeeAmount = Math.round(grossAmount * mdr * 100) / 100;
    const totalFeeAmount = Math.round(grossAmount * totalFeeRate * 100) / 100;
    const netToWallet = Math.round((grossAmount - totalFeeAmount) * 100) / 100;
    const platformMarginAmount = Math.round((totalFeeAmount - gatewayFeeAmount) * 100) / 100;
    return {
      net_to_wallet: netToWallet,
      gateway_fee_amount: gatewayFeeAmount,
      platform_margin_amount: platformMarginAmount,
      total_fee_amount: totalFeeAmount,
      fee_model: 'gateway_mdr_plus_match_markup',
      mdr_decimal: mdr,
      markup_decimal: markup,
    };
  }
  const cfg = DEPOSIT_CONFIG[st] || DEPOSIT_CONFIG.promptpay;
  const gatewayFeeAmount = Math.round(grossAmount * cfg.gateway_cost * 100) / 100;
  const totalFeeAmount = Math.round(grossAmount * cfg.total_fee * 100) / 100;
  const netToWallet = Math.round((grossAmount - totalFeeAmount) * 100) / 100;
  const platformMarginAmount = Math.round((totalFeeAmount - gatewayFeeAmount) * 100) / 100;
  return {
    net_to_wallet: netToWallet,
    gateway_fee_amount: gatewayFeeAmount,
    platform_margin_amount: platformMarginAmount,
    total_fee_amount: totalFeeAmount,
  };
}

/** Client-side platform fee (legacy) */
const PLATFORM_FEE = {
  none: 0.08,
  silver: 0.06,
  gold: 0.05,
  platinum: 0.04
};

/** Sourcing Fee (ค่าจัดหา): Normal/Silver=8%, Gold/Platinum=6% */
const SOURCING_FEE = {
  none: 0.08,
  silver: 0.08,
  gold: 0.06,
  platinum: 0.06
};

/** Booking Fee (เฉพาะหมวด Slot-based Booking): N=32%, S=28%, G=24%, P=20% */
const BOOKING_FEE = {
  none: 0.32,
  silver: 0.28,
  gold: 0.24,
  platinum: 0.20
};

/** Bidding Fee (ค่าบิดส่วนต่าง): N/S=9.3%, G=8.3%, P=6.3% */
const BIDDING_FEE = {
  none: 0.093,
  silver: 0.093,
  gold: 0.083,
  platinum: 0.063
};

/** Match Board / Advance Jobs: Sourcing + Bidding (legacy alias) */
const COMMISSION_MATCH_BOARD = BIDDING_FEE;

/** Booking: ใช้ BOOKING_FEE โดยตรง */
const COMMISSION_BOOKING = BOOKING_FEE;

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

/** Sourcing: N/S=8%, G/P=6% */
function getSourcingFee(tier) {
  return SOURCING_FEE[normalizeTier(tier)] ?? 0.08;
}

/** Booking: N=32%, S=28%, G=24%, P=20% (เฉพาะหมวด Slot-based) */
function getBookingFee(tier) {
  return BOOKING_FEE[normalizeTier(tier)] ?? 0.32;
}

/** Bidding: N/S=9.3%, G=8.3%, P=6.3% */
function getBiddingFee(tier) {
  return BIDDING_FEE[normalizeTier(tier)] ?? 0.093;
}

/** Match Board / Advance: Sourcing + Bidding */
function getMatchBoardTotalFee(tier) {
  return getSourcingFee(tier) + getBiddingFee(tier);
}

export {
  DEPOSIT_CONFIG,
  calcDepositFeeBreakdown,
  PLATFORM_FEE,
  SOURCING_FEE,
  BOOKING_FEE,
  BIDDING_FEE,
  COMMISSION_MATCH_BOARD,
  COMMISSION_BOOKING,
  VIP_ADMIN_SIPHON_PERCENT,
  getPlatformFeeRate,
  getCommissionMatchBoard,
  getCommissionBooking,
  getSourcingFee,
  getBookingFee,
  getBiddingFee,
  getMatchBoardTotalFee,
  calcPlatformFee,
  calcCommissionMatchBoard,
  calcCommissionBooking,
  calcVipAdminFundSiphon,
  normalizeTier
};
