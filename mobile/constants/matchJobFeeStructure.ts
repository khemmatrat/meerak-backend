/**
 * Match Job Fee Structure — LOCKED REFERENCE
 * Aligned with backend/lib/financialEngine.js
 * Sourcing: None/Silver 8% | Gold/Platinum 6%
 * Commission: None 24% | Silver 22% | Gold 20% | Platinum 18%
 * Tax: 3% of (Sourcing + Commission)
 */

const SOURCING_RATE: Record<string, number> = {
  none: 0.08,
  silver: 0.08,
  gold: 0.06,
  platinum: 0.06,
};

const PLATFORM_COMMISSION_RATE: Record<string, number> = {
  none: 0.24,
  silver: 0.22,
  gold: 0.2,
  platinum: 0.18,
};

const TAX_SERVICE_RATE = 0.03;

function normalizeTier(tier: string | null | undefined): string {
  const t = (tier || "none").toString().toLowerCase().trim();
  return ["silver", "gold", "platinum"].includes(t) ? t : "none";
}

/**
 * Match Job — Talent side (Sourcing, Commission, net)
 */
export function calcMatchJobTalentBreakdown(
  jobFee: number,
  providerVipTier?: string | null
): { sourcingFee: number; commission: number; taxService: number; talentNet: number } {
  const tier = normalizeTier(providerVipTier);
  const sourcingRate = SOURCING_RATE[tier] ?? 0.08;
  const commissionRate = PLATFORM_COMMISSION_RATE[tier] ?? 0.24;
  const sourcingFee = Math.round((jobFee * sourcingRate) * 100) / 100;
  const commission = Math.round((jobFee * commissionRate) * 100) / 100;
  const taxService = Math.round((sourcingFee + commission) * TAX_SERVICE_RATE * 100) / 100;
  const talentNet = Math.round((jobFee - sourcingFee - commission - taxService) * 100) / 100;
  return { sourcingFee, commission, taxService, talentNet };
}
