/**
 * Booking Fee Structure — LOCKED REFERENCE
 * Aligned with backend/lib/financialEngine.js
 * Markup Fee (Employer pays on deposit): None 8% | Silver 7% | Gold 6% | Platinum 5%
 * Sourcing: 8% fixed | Commission: None 32% | Silver 28% | Gold 24% | Platinum 20%
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

function normalizeTier(tier: string | null | undefined): string {
  const t = (tier || "none").toString().toLowerCase().trim();
  return ["silver", "gold", "platinum"].includes(t) ? t : "none";
}

/**
 * Calculate total amount employer (booker) pays at pay-deposit
 * totalToPay = deposit_amount × (1 + markup_rate)
 */
export function calcBookingEmployerTotal(
  depositAmount: number,
  bookerVipTier?: string | null
): { totalToPay: number; markupAmount: number; markupRate: number } {
  const tier = normalizeTier(bookerVipTier);
  const markupRate = BOOKING_MARKUP_RATE[tier] ?? 0.08;
  const markupAmount = Math.round((depositAmount * markupRate) * 100) / 100;
  const totalToPay = Math.round((depositAmount * (1 + markupRate)) * 100) / 100;
  return { totalToPay, markupAmount, markupRate };
}

/**
 * Calculate Talent side breakdown (Sourcing, Commission, net payout)
 * For initial booking: finalBidPrice = depositAmount (no surplus)
 */
export function calcBookingTalentBreakdown(
  depositAmount: number,
  finalBidPrice?: number,
  talentVipTier?: string | null
): {
  depositAmount: number;
  sourcingFee: number;
  commission: number;
  talentPayout: number;
  commissionRate: number;
} {
  const amount = finalBidPrice ?? depositAmount;
  const tier = normalizeTier(talentVipTier);
  const commissionRate = BOOKING_COMMISSION_RATE[tier] ?? 0.32;
  const sourcingFee = Math.round((depositAmount * BOOKING_SOURCING_RATE) * 100) / 100;
  const commission = Math.round((depositAmount * commissionRate) * 100) / 100;
  const talentPayout = Math.round((depositAmount - sourcingFee - commission) * 100) / 100;
  return {
    depositAmount,
    sourcingFee,
    commission,
    talentPayout,
    commissionRate,
  };
}
