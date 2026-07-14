/**
 * Tier-based billing middleware (P2)
 * gross < 25,000 THB/month => 0 THB rental fee
 * gross >= 25,000 THB => capped flat rental fee
 */
export function computeTierBilling(grossSalesThb, opts = {}) {
  const threshold = Number(opts.freeThresholdThb ?? process.env.TIER_FREE_THRESHOLD_THB ?? 25000);
  const maxFee = Number(opts.maxRentalFeeThb ?? process.env.TIER_MAX_RENTAL_FEE_THB ?? 5000);
  const gross = Number(grossSalesThb) || 0;

  if (gross < threshold) {
    return { tierLabel: "free", rentalFeeThb: 0, grossSalesThb: gross };
  }

  const tiers = [
    { min: threshold, max: 100000, fee: 999 },
    { min: 100000, max: 500000, fee: 2499 },
    { min: 500000, max: Infinity, fee: maxFee },
  ];

  const tier = tiers.find((t) => gross >= t.min && gross < t.max) || tiers[tiers.length - 1];
  return {
    tierLabel: gross >= 500000 ? "enterprise" : gross >= 100000 ? "growth" : "starter",
    rentalFeeThb: Math.min(tier.fee, maxFee),
    grossSalesThb: gross,
  };
}

export default computeTierBilling;
