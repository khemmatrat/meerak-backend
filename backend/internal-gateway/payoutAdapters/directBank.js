/**
 * @fileoverview Direct bank API rail adapter (e.g. KBank direct — placeholder).
 */

/**
 * @param {import('./types.js').PayoutRouteContext} ctx
 * @returns {import('./types.js').PayoutRouteCandidate | null}
 */
export function getDirectBankCandidate(ctx) {
  if (ctx.directBankAvailable === false) return null;
  const amt = Math.max(0, Number(ctx.amountMinor) || 0);
  const directFee = Math.min(3500, Math.round(amt * 0.0025));
  const directLatency = 15_000;
  return {
    id: 'direct_bank_api',
    estFeeMinor: directFee,
    estLatencyMs: directLatency,
    available: true,
  };
}
