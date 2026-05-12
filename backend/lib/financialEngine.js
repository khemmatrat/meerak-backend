/**
 * FINANCIAL ENGINE — LOCKED CALCULATION LOGIC
 * ==========================================
 * CRITICAL: No modifications allowed without owner authorization.
 * All calculations are deterministic and verified.
 *
 * Match Job & Advance Job: Unified logic
 * Booking Talents: Party/Slots with markup + bidding surplus
 *
 * @locked
 */

const round2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

function normalizeTier(tier) {
  const t = (tier || 'none').toString().toLowerCase().trim();
  return ['silver', 'gold', 'platinum'].includes(t) ? t : 'none';
}

// ============ MATCH JOB & ADVANCE JOB ============
// Sourcing: None/Silver 8% | Gold/Platinum 6%
const SOURCING_RATE = { none: 0.08, silver: 0.08, gold: 0.06, platinum: 0.06 };
// Platform Commission: None 24% | Silver 22% | Gold 20% | Platinum 18%
const PLATFORM_COMMISSION_RATE = { none: 0.24, silver: 0.22, gold: 0.20, platinum: 0.18 };
const TAX_SERVICE_RATE = 0.03; // 3% of (Sourcing + Commission)
const PAYMENT_MARKUP_RATE = 0.05; // 5%

/**
 * Match/Advance Job — Employer side (outflow)
 * finalPrice = (jobFee + insuranceAmount) × 1.05
 */
function calcMatchJobEmployerOutflow(jobFee, insuranceAmount) {
  const base = round2(jobFee + insuranceAmount);
  const paymentMarkup = round2(base * PAYMENT_MARKUP_RATE);
  const finalPrice = round2(base * (1 + PAYMENT_MARKUP_RATE));
  return { jobFee, insuranceAmount, paymentMarkup, finalPrice, base };
}

/**
 * Match/Advance Job — Provider side (inflow)
 * talentNet = jobFee - (Sourcing + Commission + Tax)
 * Tax = 3% of (Sourcing + Commission)
 */
/**
 * @param {object} [options]
 * @param {boolean} [options.waivePlatformCommission] — Brand Adviser active: platform commission = 0; sourcing + tax on (sourcing+commission) remain
 */
function calcMatchJobProviderInflow(jobFee, providerVipTier, options = {}) {
  const tier = normalizeTier(providerVipTier);
  const sourcingRate = SOURCING_RATE[tier] ?? 0.08;
  const waive = options?.waivePlatformCommission === true;
  const commissionRate = waive ? 0 : (PLATFORM_COMMISSION_RATE[tier] ?? 0.24);

  const sourcingFee = round2(jobFee * sourcingRate);
  const platformCommission = waive ? 0 : round2(jobFee * commissionRate);
  const taxServiceAmount = round2((sourcingFee + platformCommission) * TAX_SERVICE_RATE);
  const totalDeduction = round2(sourcingFee + platformCommission + taxServiceAmount);
  const talentNet = round2(jobFee - totalDeduction);

  return {
    jobFee,
    sourcingFee,
    platformCommission,
    taxServiceAmount,
    totalDeduction,
    talentNet,
    sourcingRate,
    commissionRate,
    platformRevenue: round2(sourcingFee + platformCommission + taxServiceAmount),
    brandAdviserWaivedPlatformCommission: waive,
  };
}

// ============ BOOKING TALENTS ============
// Booking Commission: None 32% | Silver 28% | Gold 24% | Platinum 20%
const BOOKING_COMMISSION_RATE = { none: 0.32, silver: 0.28, gold: 0.24, platinum: 0.20 };
// Sourcing for Booking: 8% fixed
const BOOKING_SOURCING_RATE = 0.08;
// Bidding Fee: 9.3% on surplus only
const BIDDING_FEE_RATE = 0.093;
// Markup Fee (employer pays on top of deposit): None 8% | Silver 7% | Gold 6% | Platinum 5%
const BOOKING_MARKUP_RATE = { none: 0.08, silver: 0.07, gold: 0.06, platinum: 0.05 };

/**
 * Booking — Employer side (what booker pays at pay-deposit)
 * totalToPay = deposit_amount × (1 + markup_rate)
 */
function calcBookingEmployerOutflow(depositAmount, bookerVipTier) {
  const tier = normalizeTier(bookerVipTier);
  const markupRate = BOOKING_MARKUP_RATE[tier] ?? 0.08;
  const markupAmount = round2(depositAmount * markupRate);
  const totalToPay = round2(depositAmount * (1 + markupRate));
  return { depositAmount, markupRate, markupAmount, totalToPay };
}

/**
 * Booking — Release deposit (Platform revenue & Talent payout)
 * Base: Sourcing 8% + Booking Commission (32%/28%/24%/20%)
 * Surplus (when bid): Bidding 9.3% on (finalBidPrice - depositAmount) only
 */
/**
 * @param {object} [options]
 * @param {boolean} [options.waiveBookingCommission] — Brand Adviser: tier booking commission = 0; sourcing 8% + bidding fee on surplus unchanged
 */
function calcBookingRelease(depositAmount, finalBidPrice, talentVipTier, options = {}) {
  const tier = normalizeTier(talentVipTier);
  const waive = options?.waiveBookingCommission === true;
  const commissionRate = waive ? 0 : (BOOKING_COMMISSION_RATE[tier] ?? 0.32);

  // Base (deposit_amount)
  const sourcingFee = round2(depositAmount * BOOKING_SOURCING_RATE);
  const bookingCommission = waive ? 0 : round2(depositAmount * commissionRate);
  const platformFromBase = round2(sourcingFee + bookingCommission);
  const talentBase = round2(depositAmount - platformFromBase);

  // Surplus (only when finalBidPrice > depositAmount)
  const surplus = round2(Math.max(0, finalBidPrice - depositAmount));
  const biddingFee = surplus > 0 ? round2(surplus * BIDDING_FEE_RATE) : 0;
  const talentSurplus = round2(surplus - biddingFee);
  const platformFromSurplus = biddingFee;

  const talentPayout = round2(talentBase + talentSurplus);
  const totalPlatformRevenue = round2(platformFromBase + platformFromSurplus);

  return {
    depositAmount,
    finalBidPrice,
    surplus,
    sourcingFee,
    bookingCommission,
    platformFromBase,
    talentBase,
    biddingFee,
    talentSurplus,
    platformFromSurplus,
    talentPayout,
    totalPlatformRevenue,
    commissionRate,
    isChallenged: surplus > 0,
    brandAdviserWaivedBookingCommission: waive,
  };
}

/**
 * Full metadata for ledger audit (append-only)
 */
function buildMatchJobLedgerMetadata(employerResult, providerResult, extra = {}) {
  return {
    jobFee: employerResult.jobFee,
    insurance: employerResult.insuranceAmount,
    markup: employerResult.paymentMarkup,
    sourcing: providerResult.sourcingFee,
    commission: providerResult.platformCommission,
    tax_service: providerResult.taxServiceAmount,
    bidding_fee: 0,
    talentNet: providerResult.talentNet,
    ...extra
  };
}

function buildBookingLedgerMetadata(result, extra = {}) {
  return {
    deposit_amount: result.depositAmount,
    final_bid_price: result.finalBidPrice,
    surplus: result.surplus,
    sourcing: result.sourcingFee,
    commission: result.bookingCommission,
    bidding_fee: result.biddingFee,
    talent_payout: result.talentPayout,
    platform_revenue: result.totalPlatformRevenue,
    ...extra
  };
}

/**
 * Verify Match Job transaction balance: finalPrice = talentNet + platformFee + paymentMarkup + insurance
 */
function verifyMatchJobBalance(jobFee, insuranceAmount, providerVipTier) {
  const emp = calcMatchJobEmployerOutflow(jobFee, insuranceAmount);
  const prov = calcMatchJobProviderInflow(jobFee, providerVipTier);
  const platformFee = round2(prov.sourcingFee + prov.platformCommission + prov.taxServiceAmount);
  const rhs = round2(prov.talentNet + platformFee + emp.paymentMarkup + emp.insuranceAmount);
  const residual = round2(emp.finalPrice - rhs);
  return { ok: Math.abs(residual) < 0.01, employerPays: emp.finalPrice, talentNet: prov.talentNet, platformFee, markup: emp.paymentMarkup, insurance: emp.insuranceAmount, residual };
}

/**
 * Verify Booking transaction balance
 */
function verifyBookingBalance(depositAmount, finalBidPrice, talentVipTier) {
  const r = calcBookingRelease(depositAmount, finalBidPrice, talentVipTier);
  const total = round2(r.talentPayout + r.totalPlatformRevenue);
  const expected = round2(depositAmount + r.surplus);
  const check = round2(expected - total);
  return { ok: Math.abs(check) < 0.01, totalDistributed: total, expected, residual: check };
}

// ============ AQOND MARINE ============
// Markup 6% ถาวร (ทุก tier) — กรณียกเลิก platform ไม่เก็บ markup
const MARINE_MARKUP_RATE = 0.06;
// ค่าจัดหา 10% — หักจากกัปตันเมื่องานเสร็จ
const MARINE_SOURCING_RATE = 0.10;
// ค่าจัดการระบบ 8% — หักจากเงินชดเชยกัปตันเมื่อยกเลิก
const MARINE_CANCELLATION_PLATFORM_FEE_RATE = 0.08;

/**
 * Marine — Employer side (ตอนจอง)
 * totalToPay = totalPrice × (1 + 6%)
 * กรณียกเลิก: platform ไม่เก็บ markup — คืนเต็มตามสัดส่วน
 */
function calcMarineEmployerOutflow(totalPrice) {
  const markupAmount = round2(totalPrice * MARINE_MARKUP_RATE);
  const totalToPay = round2(totalPrice * (1 + MARINE_MARKUP_RATE));
  return { totalPrice, markupAmount, totalToPay, markupRate: MARINE_MARKUP_RATE };
}

/**
 * Marine — Complete: ปล่อยเงินให้กัปตัน (หลัง accept จนเสร็จ)
 * Sourcing 10% → platform, กัปตันได้ 90%
 */
function calcMarineCompleteRelease(jobPrice) {
  const sourcingFee = round2(jobPrice * MARINE_SOURCING_RATE);
  const captainPayout = round2(jobPrice - sourcingFee);
  return {
    jobPrice,
    sourcingFee,
    captainPayout,
    platformRevenue: sourcingFee,
    sourcingRate: MARINE_SOURCING_RATE
  };
}

/**
 * Marine — Cancel: เงินชดเชยกัปตัน
 * Platform เก็บ 8% ของเงินชดเชยที่กัปตันได้
 */
function calcMarineCancellationCompensation(grossCompensation) {
  const platformFee = round2(grossCompensation * MARINE_CANCELLATION_PLATFORM_FEE_RATE);
  const captainNet = round2(grossCompensation - platformFee);
  return {
    grossCompensation,
    platformFee,
    captainNet,
    platformFeeRate: MARINE_CANCELLATION_PLATFORM_FEE_RATE
  };
}

export {
  round2,
  normalizeTier,
  calcMatchJobEmployerOutflow,
  calcMatchJobProviderInflow,
  calcBookingEmployerOutflow,
  calcBookingRelease,
  buildMatchJobLedgerMetadata,
  buildBookingLedgerMetadata,
  verifyMatchJobBalance,
  verifyBookingBalance,
  SOURCING_RATE,
  PLATFORM_COMMISSION_RATE,
  BOOKING_COMMISSION_RATE,
  BOOKING_SOURCING_RATE,
  BIDDING_FEE_RATE,
  BOOKING_MARKUP_RATE,
  TAX_SERVICE_RATE,
  PAYMENT_MARKUP_RATE,
  // Marine
  MARINE_MARKUP_RATE,
  MARINE_SOURCING_RATE,
  MARINE_CANCELLATION_PLATFORM_FEE_RATE,
  calcMarineEmployerOutflow,
  calcMarineCompleteRelease,
  calcMarineCancellationCompensation
};
