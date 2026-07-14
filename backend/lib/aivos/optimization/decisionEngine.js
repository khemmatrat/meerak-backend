/**
 * Decision Engine – multi-criteria decision making (MCDM) for selecting the
 * optimal action when multiple conflicting objectives exist.
 *
 * Uses weighted sum model (WSM) with configurable criteria weights.
 * Supports: model selection, platform selection, strategy selection.
 */
export function createDecisionEngine(deps = {}) {
  const decisions = [];

  /** Default objective weights (must sum to 1). */
  const DEFAULT_WEIGHTS = { quality: 0.4, cost: 0.3, latency: 0.2, reach: 0.1 };

  let weights = { ...DEFAULT_WEIGHTS };

  /** Update objective weights. Values are normalised to sum to 1. */
  function setWeights(newWeights) {
    const total = Object.values(newWeights).reduce((s, v) => s + v, 0);
    if (total === 0) throw new Error('weights_must_be_nonzero');
    weights = Object.fromEntries(Object.entries(newWeights).map(([k, v]) => [k, v / total]));
  }

  /**
   * Evaluate a list of options and return the best one.
   * Each option: { id, quality, cost, latency, reach }  (all in [0,1])
   * Lower cost/latency is better, so we invert them.
   *
   * @param {object[]} options
   * @param {object} [customWeights]
   * @returns {{ winner: object, ranked: object[], weights }}
   */
  function evaluate(options = [], customWeights = null) {
    const w = customWeights || weights;

    const scored = options.map((opt) => {
      const score =
        (opt.quality || 0) * (w.quality || 0) +
        (1 - Math.min(1, opt.cost || 0)) * (w.cost || 0) +
        (1 - Math.min(1, opt.latency || 0)) * (w.latency || 0) +
        (opt.reach || 0) * (w.reach || 0);
      return { ...opt, score: parseFloat(score.toFixed(4)) };
    });

    scored.sort((a, b) => b.score - a.score);
    const winner = scored[0] || null;
    const decision = { ts: new Date().toISOString(), winner, ranked: scored, weights: w };
    decisions.push(decision);
    return decision;
  }

  /**
   * Select the best strategy from a named strategy set.
   * @param {{ [name]: { quality, cost, latency, reach } }} strategies
   * @returns {{ winner: string, score, ranked }}
   */
  function selectStrategy(strategies = {}) {
    const options = Object.entries(strategies).map(([id, v]) => ({ id, ...v }));
    const result = evaluate(options);
    return { winner: result.winner?.id || null, score: result.winner?.score || 0, ranked: result.ranked.map((r) => ({ id: r.id, score: r.score })) };
  }

  /** Get decision audit trail. */
  function auditTrail(last = 20) { return decisions.slice(-last); }

  return { evaluate, selectStrategy, setWeights, getWeights: () => ({ ...weights }), auditTrail };
}

export default createDecisionEngine;
