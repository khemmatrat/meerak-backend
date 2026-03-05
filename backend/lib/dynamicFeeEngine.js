/**
 * Dynamic Fee Engine — Platform Fee & Commission by VIP Tier & Job Type (Spec ชัย)
 *
 * Client Side (Platform Fee):
 *   General: 8%, Silver: 6%, Gold: 5%, Platinum: 4%
 *
 * Partner Side (Commission):
 *   Match/Board: General 24%, Silver 18%, Gold 15%, Platinum 12%
 *   Booking:     General 32%, Silver 18%, Gold 15%, Platinum 12%
 */
const round2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

const PLATFORM_FEE_BY_TIER = {
  none: 0.08,
  silver: 0.06,
  gold: 0.05,
  platinum: 0.04,
};

const COMMISSION_MATCH_BOARD_BY_TIER = {
  none: 0.24,
  silver: 0.18,
  gold: 0.15,
  platinum: 0.12,
};

const COMMISSION_BOOKING_BY_TIER = {
  none: 0.32,
  silver: 0.18,
  gold: 0.15,
  platinum: 0.12,
};

const VIP_ADMIN_FUND_PERCENT = 12.5;

function getTier(user) {
  if (!user || !user.vip_tier) return 'none';
  return (user.vip_tier || 'none').toLowerCase().trim();
}

function isVipActive(user) {
  const tier = getTier(user);
  if (tier === 'none') return false;
  if (user.vip_expiry && new Date(user.vip_expiry).getTime() < Date.now()) return false;
  const quota = user.vip_quota_balance != null ? parseInt(user.vip_quota_balance, 10) : 0;
  if (tier !== 'platinum' && quota <= 0) return false;
  return true;
}

/**
 * Platform Fee (Client) — ค่าธรรมเนียมที่จ้างงานต้องจ่ายเพิ่ม
 * @param {object} clientUser - user ของ employer/client
 * @param {number} grossAmount - ยอดรวมก่อนหัก
 * @returns {{ feePercent, feeAmount, tier }}
 */
function getPlatformFee(clientUser, grossAmount) {
  const tier = getTier(clientUser);
  const active = isVipActive(clientUser);
  const rate = PLATFORM_FEE_BY_TIER[tier] ?? PLATFORM_FEE_BY_TIER.none;
  const effectiveRate = active ? rate : PLATFORM_FEE_BY_TIER.none;
  const feeAmount = round2(grossAmount * effectiveRate);
  return { feePercent: effectiveRate * 100, feeAmount, tier };
}

/**
 * Commission (Partner) — ค่าคอมมิชชั่นที่หักจากรายได้ผู้รับงาน
 * @param {object} clientUser - user ของ employer (VIP tier ของ client)
 * @param {string} jobType - 'match' | 'board' | 'booking'
 * @param {number} grossAmount - ยอดรวมงาน
 * @returns {{ commissionPercent, commissionAmount, providerReceive, vipApplied, tier }}
 */
function getCommission(clientUser, jobType, grossAmount) {
  const tier = getTier(clientUser);
  const active = isVipActive(clientUser);

  const rates = jobType === 'booking'
    ? COMMISSION_BOOKING_BY_TIER
    : COMMISSION_MATCH_BOARD_BY_TIER;

  const rate = active ? (rates[tier] ?? rates.none) : rates.none;
  const commissionAmount = round2(grossAmount * rate);
  const providerReceive = round2(grossAmount - commissionAmount);

  return {
    commissionPercent: rate * 100,
    commissionAmount,
    providerReceive,
    vipApplied: active && tier !== 'none',
    tier,
  };
}

/**
 * VIP Admin Fund — 12.5% ของ gross profit จากธุรกรรม VIP
 * @param {number} grossProfit - กำไรขั้นต้น (fee + commission)
 * @param {boolean} isVip - เป็นธุรกรรม VIP หรือไม่
 * @returns {number} - จำนวนที่ต้อง siphon เข้า vip_admin_fund
 */
function getVipAdminFundAmount(grossProfit, isVip) {
  if (!isVip || grossProfit <= 0) return 0;
  return round2(grossProfit * (VIP_ADMIN_FUND_PERCENT / 100));
}

module.exports = {
  round2,
  getTier,
  isVipActive,
  getPlatformFee,
  getCommission,
  getVipAdminFundAmount,
  PLATFORM_FEE_BY_TIER,
  COMMISSION_MATCH_BOARD_BY_TIER,
  COMMISSION_BOOKING_BY_TIER,
  VIP_ADMIN_FUND_PERCENT,
};
