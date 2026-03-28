/**
 * @fileoverview PromptPay bulk rail adapter (placeholder fee/latency — swap for live tariffs).
 */

/**
 * @param {import('./types.js').PayoutRouteContext} ctx
 * @returns {import('./types.js').PayoutRouteCandidate | null}
 */
export function getPromptpayBulkCandidate(ctx) {
  if (ctx.promptpayBulkAvailable === false) return null;
  const amt = Math.max(0, Number(ctx.amountMinor) || 0);
  const bulkFee = Math.min(2500, Math.round(amt * 0.0015));
  const bulkLatency = ctx.preferSpeed ? 120_000 : 45_000;
  return {
    id: 'promptpay_bulk',
    estFeeMinor: bulkFee,
    estLatencyMs: bulkLatency,
    available: true,
  };
}
