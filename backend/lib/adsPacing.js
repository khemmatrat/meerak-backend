/**
 * Package → delivery pacing caps (impressions / day).
 */

export function impressionCostMicro(cpmMicro) {
  const cpm = BigInt(String(cpmMicro || 0));
  if (cpm <= 0n) return 0n;
  return cpm / 1000n;
}

/**
 * @param {string|bigint} budgetMicro prepaid package budget
 * @param {string|bigint} cpmMicro nominal CPM in micro-THB
 */
export function computePacingCaps(budgetMicro, cpmMicro) {
  const budget = BigInt(String(budgetMicro || 0));
  const cpm = BigInt(String(cpmMicro || 0));
  const totalImpressions =
    cpm > 0n ? Number(budget * 1000n / cpm) : 0;
  const campaignDays = 7;
  const dailyImpressionCap =
    totalImpressions > 0
      ? Math.max(1, Math.ceil(totalImpressions / campaignDays))
      : null;
  return {
    totalImpressions,
    dailyImpressionCap,
    impressionCostMicro: impressionCostMicro(cpm),
    campaignDays,
  };
}

/** Hour-of-day pacing multiplier (conservative — peak hours get less delivery). */
export function hourlyPacingMultiplier(date = new Date()) {
  const h = date.getUTCHours();
  if (h >= 2 && h <= 8) return 0.6;
  if (h >= 9 && h <= 14) return 1.0;
  if (h >= 15 && h <= 20) return 1.1;
  return 0.8;
}
