/**
 * @fileoverview Registry of payout adapters — add a new file + register here (no core edits elsewhere).
 */
import { getPromptpayBulkCandidate } from './promptpayBulk.js';
import { getDirectBankCandidate } from './directBank.js';
import { getKsherPlaceholderCandidate } from './ksherPlaceholder.js';

/** @type {Array<(ctx: import('./types.js').PayoutRouteContext) => import('./types.js').PayoutRouteCandidate | null>} */
const ADAPTER_GETTERS = [getPromptpayBulkCandidate, getDirectBankCandidate, getKsherPlaceholderCandidate];

/**
 * Collects candidates from all registered adapters and picks lowest composite score.
 * @param {import('./types.js').PayoutRouteContext} ctx
 * @returns {import('./types.js').PayoutRouteHint}
 */
export function suggestPayoutRoute(ctx) {
  const routes = [];
  for (const get of ADAPTER_GETTERS) {
    const c = get(ctx);
    if (!c || c.available === false) continue;
    routes.push({
      route: c.id,
      estFeeMinor: c.estFeeMinor,
      estLatencyMs: c.estLatencyMs,
      score: c.estFeeMinor * 2 + c.estLatencyMs / 1000,
    });
  }
  if (!routes.length) {
    const amt = Math.max(0, Number(ctx.amountMinor) || 0);
    const bulkFee = Math.min(2500, Math.round(amt * 0.0015));
    const bulkLatency = ctx.preferSpeed ? 120_000 : 45_000;
    return {
      route: 'promptpay_bulk',
      score: 0,
      estFeeMinor: bulkFee,
      estLatencyMs: bulkLatency,
      reason: 'default_no_adapter_matched',
    };
  }
  routes.sort((a, b) => a.score - b.score);
  const best = routes[0];
  return {
    route: best.route,
    score: best.score,
    estFeeMinor: best.estFeeMinor,
    estLatencyMs: best.estLatencyMs,
    reason: 'lowest_combined_score_fee_x2_plus_latency_s',
  };
}
