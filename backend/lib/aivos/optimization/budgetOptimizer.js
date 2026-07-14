/**
 * Budget Optimizer – allocates spend across platforms, models, and campaigns
 * to maximise ROI within a total budget constraint.
 *
 * Uses a greedy marginal-ROI allocation strategy.
 */
export function createBudgetOptimizer(deps = {}) {
  const kpiCalculator = deps.kpiCalculator || null;

  const allocations = new Map();
  const history = [];

  /**
   * Optimise budget allocation.
   * @param {{ totalBudget, channels: { id, minBudget?, expectedRoi }[] }} params
   * @returns {{ allocation: { id, budget, share }[], totalAllocated, expectedReturn }}
   */
  function allocate({ totalBudget, channels = [] }) {
    if (!channels.length || !totalBudget) return { allocation: [], totalAllocated: 0, expectedReturn: 0 };

    // Sort channels by expected ROI descending
    const sorted = [...channels].sort((a, b) => (b.expectedRoi || 0) - (a.expectedRoi || 0));

    let remaining = totalBudget;
    const allocation = [];

    // First pass: allocate minimums
    for (const ch of sorted) {
      const min = ch.minBudget || 0;
      allocation.push({ id: ch.id, budget: min, expectedRoi: ch.expectedRoi || 0 });
      remaining -= min;
    }

    // Second pass: distribute remaining proportionally to ROI
    const totalRoi = sorted.reduce((s, c) => s + Math.max(0, c.expectedRoi || 0), 0);
    if (totalRoi > 0 && remaining > 0) {
      for (const entry of allocation) {
        const share = (entry.expectedRoi / totalRoi);
        entry.budget += remaining * share;
        entry.share = share;
      }
    }

    const totalAllocated = allocation.reduce((s, a) => s + a.budget, 0);
    const expectedReturn = allocation.reduce((s, a) => s + a.budget * (a.expectedRoi || 0), 0);

    const result = { allocation, totalAllocated, expectedReturn };
    history.push({ ts: new Date().toISOString(), totalBudget, ...result });
    allocations.set(Date.now().toString(), result);
    return result;
  }

  /** Get the most recent allocation. */
  function latest() { return history[history.length - 1] || null; }

  return { allocate, latest };
}

export default createBudgetOptimizer;
