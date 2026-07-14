/**
 * Profit Engine – calculates gross profit, net profit, EBITDA, and margins.
 *
 * Inputs: revenue streams + cost buckets (COGS, operating, AI inference, etc.)
 */
export function createProfitEngine(deps = {}) {
  const revenues  = []; // { stream, amount, ts }
  const costs     = []; // { bucket, amount, ts }

  function recordRevenue({ stream, amount, ts = null }) {
    revenues.push({ stream, amount, ts: ts || new Date().toISOString() });
  }

  function recordCost({ bucket, amount, ts = null }) {
    costs.push({ bucket, amount, ts: ts || new Date().toISOString() });
  }

  /**
   * Compute profit summary.
   * @param {{ since?, stream?, bucket? }} filter
   * @returns {{ grossRevenue, cogs, grossProfit, grossMargin, operatingCosts, netProfit, netMargin }}
   */
  function calculate(filter = {}) {
    const filterDate = (d) => !filter.since || d.ts >= filter.since;

    const filteredRev = revenues.filter(filterDate).filter((r) => !filter.stream || r.stream === filter.stream);
    const filteredCost = costs.filter(filterDate).filter((c) => !filter.bucket || c.bucket === filter.bucket);

    const grossRevenue   = filteredRev.reduce((s, r) => s + r.amount, 0);
    const cogs           = filteredCost.filter((c) => c.bucket === 'cogs').reduce((s, c) => s + c.amount, 0);
    const grossProfit    = grossRevenue - cogs;
    const grossMargin    = grossRevenue > 0 ? grossProfit / grossRevenue : 0;
    const operatingCosts = filteredCost.filter((c) => c.bucket !== 'cogs').reduce((s, c) => s + c.amount, 0);
    const netProfit      = grossProfit - operatingCosts;
    const netMargin      = grossRevenue > 0 ? netProfit / grossRevenue : 0;

    return { grossRevenue, cogs, grossProfit, grossMargin, operatingCosts, netProfit, netMargin };
  }

  /** Revenue breakdown by stream. */
  function byStream() {
    const streams = [...new Set(revenues.map((r) => r.stream))];
    return streams.map((s) => ({ stream: s, amount: revenues.filter((r) => r.stream === s).reduce((acc, r) => acc + r.amount, 0) }));
  }

  return { recordRevenue, recordCost, calculate, byStream };
}

export default createProfitEngine;
