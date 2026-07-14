/**
 * Slot-based Talent Booking fee helpers (Profile A).
 * Defaults match backend/lib/bookingFeeConfig.js — override via GET /api/payments/fee-config.
 */

const BOOKING_MARKUP_RATE: Record<string, number> = {
  none: 0.08,
  silver: 0.07,
  gold: 0.06,
  platinum: 0.05,
};

const BOOKING_COMMISSION_RATE: Record<string, number> = {
  none: 0.32,
  silver: 0.28,
  gold: 0.24,
  platinum: 0.2,
};

const BOOKING_SOURCING_RATE = 0.08;

export type SlotBookingFeeConfig = {
  platformFee?: Record<string, number>;
  commissionBooking?: Record<string, number>;
  bookingSourcingPercent?: number;
  biddingFeePercent?: number;
};

function normalizeTier(tier: string | null | undefined): string {
  const t = (tier || "none").toString().toLowerCase().trim();
  return ["silver", "gold", "platinum"].includes(t) ? t : "none";
}

function tierPercentRate(
  map: Record<string, number> | undefined,
  tier: string,
  fallbackDecimal: number,
): number {
  if (!map) return fallbackDecimal;
  const pct = Number(map[tier] ?? map.none);
  return Number.isFinite(pct) ? pct / 100 : fallbackDecimal;
}

function markupRate(tier: string, config?: SlotBookingFeeConfig): number {
  if (config?.platformFee) {
    return tierPercentRate(
      config.platformFee,
      tier,
      BOOKING_MARKUP_RATE[tier] ?? 0.08,
    );
  }
  return BOOKING_MARKUP_RATE[tier] ?? 0.08;
}

function commissionRate(tier: string, config?: SlotBookingFeeConfig): number {
  if (config?.commissionBooking) {
    return tierPercentRate(
      config.commissionBooking,
      tier,
      BOOKING_COMMISSION_RATE[tier] ?? 0.32,
    );
  }
  return BOOKING_COMMISSION_RATE[tier] ?? 0.32;
}

function sourcingRate(config?: SlotBookingFeeConfig): number {
  const pct = config?.bookingSourcingPercent;
  if (pct != null && Number.isFinite(Number(pct))) return Number(pct) / 100;
  return BOOKING_SOURCING_RATE;
}

/**
 * Calculate total amount employer (booker) pays at pay-deposit
 * totalToPay = deposit_amount × (1 + markup_rate)
 */
export function calcBookingEmployerTotal(
  depositAmount: number,
  bookerVipTier?: string | null,
  config?: SlotBookingFeeConfig,
): { totalToPay: number; markupAmount: number; markupRate: number } {
  const tier = normalizeTier(bookerVipTier);
  const markupRateVal = markupRate(tier, config);
  const markupAmount = Math.round(depositAmount * markupRateVal * 100) / 100;
  const totalToPay =
    Math.round(depositAmount * (1 + markupRateVal) * 100) / 100;
  return { totalToPay, markupAmount, markupRate: markupRateVal };
}

/**
 * Calculate Talent side breakdown (Sourcing, Commission, net payout)
 * For initial booking: finalBidPrice = depositAmount (no surplus)
 */
export function calcBookingTalentBreakdown(
  depositAmount: number,
  finalBidPrice?: number,
  talentVipTier?: string | null,
  config?: SlotBookingFeeConfig,
): {
  depositAmount: number;
  sourcingFee: number;
  commission: number;
  talentPayout: number;
  commissionRate: number;
  sourcingRate: number;
} {
  const amount = finalBidPrice ?? depositAmount;
  const tier = normalizeTier(talentVipTier);
  const commissionRateVal = commissionRate(tier, config);
  const sourcingRateVal = sourcingRate(config);
  const sourcingFee = Math.round(depositAmount * sourcingRateVal * 100) / 100;
  const commission = Math.round(depositAmount * commissionRateVal * 100) / 100;
  const talentPayout =
    Math.round((depositAmount - sourcingFee - commission) * 100) / 100;
  return {
    depositAmount,
    sourcingFee,
    commission,
    talentPayout,
    commissionRate: commissionRateVal,
    sourcingRate: sourcingRateVal,
  };
}
