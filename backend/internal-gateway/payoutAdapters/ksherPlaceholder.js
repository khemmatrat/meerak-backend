/**
 * @fileoverview Example third rail — enable via ctx.ksherAvailable when integrated.
 */

/**
 * @param {import('./types.js').PayoutRouteContext & { ksherAvailable?: boolean }} ctx
 * @returns {import('./types.js').PayoutRouteCandidate | null}
 */
export function getKsherPlaceholderCandidate(ctx) {
  if (ctx.ksherAvailable !== true) return null;
  const amt = Math.max(0, Number(ctx.amountMinor) || 0);
  const fee = Math.min(3000, Math.round(amt * 0.002));
  return {
    id: 'ksher',
    estFeeMinor: fee,
    estLatencyMs: 60_000,
    available: true,
  };
}
