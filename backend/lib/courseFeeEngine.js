/**
 * Course Marketplace fee engine.
 *
 * Keep course economics isolated from job/booking financialEngine.js.
 */

const DEFAULT_PLATFORM_RATE = 0.35;
const COACH_DIRECT_DISCOUNT_RATE = 0.1;
const COACH_DIRECT_PLATFORM_RATE = 0.25;

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export function normalizeCourseConversionPolicy(raw = {}) {
  const firstPurchaseDiscountRate = Number(
    raw.firstPurchaseDiscountRate ?? raw.first_purchase_discount_rate ?? 0.05,
  );
  const firstPurchaseBonusPoints = Number(
    raw.firstPurchaseBonusPoints ?? raw.first_purchase_bonus_points ?? 50,
  );
  const limitedSeatsBase = Number(raw.limitedSeatsBase ?? raw.limited_seats_base ?? 50);
  return {
    firstPurchaseDiscountRate:
      Number.isFinite(firstPurchaseDiscountRate) && firstPurchaseDiscountRate >= 0 && firstPurchaseDiscountRate <= 0.5
        ? firstPurchaseDiscountRate
        : 0.05,
    firstPurchaseBonusPoints:
      Number.isFinite(firstPurchaseBonusPoints) && firstPurchaseBonusPoints >= 0
        ? Math.min(firstPurchaseBonusPoints, 10000)
        : 50,
    limitedSeatsBase:
      Number.isFinite(limitedSeatsBase) && limitedSeatsBase >= 10
        ? Math.min(limitedSeatsBase, 500)
        : 50,
  };
}

export function normalizeCourseRevenuePolicy(raw = {}) {
  const platformRate = Number(raw.platformRate ?? raw.platform_rate ?? DEFAULT_PLATFORM_RATE);
  const coachDirectDiscountRate = Number(
    raw.coachDirectDiscountRate ?? raw.coach_direct_discount_rate ?? COACH_DIRECT_DISCOUNT_RATE,
  );
  const coachDirectPlatformRate = Number(
    raw.coachDirectPlatformRate ?? raw.coach_direct_platform_rate ?? COACH_DIRECT_PLATFORM_RATE,
  );
  return {
    ...normalizeCourseConversionPolicy(raw),
    platformRate: Number.isFinite(platformRate) && platformRate >= 0 && platformRate <= 0.9
      ? platformRate
      : DEFAULT_PLATFORM_RATE,
    coachDirectDiscountRate:
      Number.isFinite(coachDirectDiscountRate) && coachDirectDiscountRate >= 0 && coachDirectDiscountRate <= 0.8
        ? coachDirectDiscountRate
        : COACH_DIRECT_DISCOUNT_RATE,
    coachDirectPlatformRate:
      Number.isFinite(coachDirectPlatformRate) && coachDirectPlatformRate >= 0 && coachDirectPlatformRate <= 0.9
        ? coachDirectPlatformRate
        : COACH_DIRECT_PLATFORM_RATE,
  };
}

export function computeCoursePurchaseQuote({
  priceThb,
  originalPriceThb,
  policy,
  isCoachDirect = false,
}) {
  const normalized = normalizeCourseRevenuePolicy(policy);
  const listPrice = round2(Math.max(0, Number(priceThb || 0)));
  const anchorPrice = round2(Math.max(listPrice, Number(originalPriceThb || 0)));
  const discountRate = isCoachDirect ? normalized.coachDirectDiscountRate : 0;
  const grossAmount = round2(listPrice * (1 - discountRate));
  const platformRate = isCoachDirect ? normalized.coachDirectPlatformRate : normalized.platformRate;
  const platformFee = round2(grossAmount * platformRate);
  const instructorNet = round2(Math.max(0, grossAmount - platformFee));

  return {
    currency: 'THB',
    listPrice,
    anchorPrice,
    discountRate,
    grossAmount,
    platformRate,
    platformFee,
    instructorNet,
    savingsAmount: round2(Math.max(0, anchorPrice - grossAmount)),
  };
}

/**
 * Apply Phase 9 conversion discounts on top of base quote (coach-direct already applied).
 */
export function applyCourseConversionAdjustments(baseQuote, adjustments = {}) {
  const {
    couponDiscountRate = 0,
    firstPurchaseDiscountRate = 0,
    voucherDiscountThb = 0,
    platformRate = baseQuote?.platformRate,
  } = adjustments;
  let grossAmount = round2(Number(baseQuote?.grossAmount || 0));
  const rate = Number(platformRate ?? baseQuote?.platformRate ?? DEFAULT_PLATFORM_RATE);

  if (couponDiscountRate > 0) {
    grossAmount = round2(grossAmount * (1 - Math.min(0.8, couponDiscountRate)));
  }
  if (firstPurchaseDiscountRate > 0) {
    grossAmount = round2(grossAmount * (1 - Math.min(0.5, firstPurchaseDiscountRate)));
  }
  if (voucherDiscountThb > 0) {
    grossAmount = round2(Math.max(0, grossAmount - voucherDiscountThb));
  }

  const platformFee = round2(grossAmount * rate);
  const instructorNet = round2(Math.max(0, grossAmount - platformFee));

  return {
    ...baseQuote,
    grossAmount,
    platformRate: rate,
    platformFee,
    instructorNet,
    savingsAmount: round2(Math.max(0, Number(baseQuote?.anchorPrice || 0) - grossAmount)),
    conversionApplied: couponDiscountRate > 0 || firstPurchaseDiscountRate > 0 || voucherDiscountThb > 0,
  };
}
