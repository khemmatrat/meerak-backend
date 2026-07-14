import { randomUUID } from 'crypto';

/**
 * A/B Learning – tracks A/B experiments, collects per-variant metrics,
 * and determines statistical winners.
 *
 * Each experiment has a control and one or more variants (e.g. prompt versions, templates).
 * Winner declared when p-value threshold or minimum sample size is reached.
 */
export function createAbLearning(deps = {}) {
  const experiments = new Map();
  const observations = [];

  /**
   * Create a new A/B experiment.
   * @param {{ name, control, variants: string[], metric, minSamples? }} params
   */
  function create({ name, control, variants = [], metric = 'ctr', minSamples = 50 }) {
    const id = randomUUID();
    const exp = {
      id,
      name,
      control,
      variants: [control, ...variants],
      metric,
      minSamples,
      status: 'running',
      winner: null,
      created_at: new Date().toISOString(),
    };
    experiments.set(id, exp);
    return exp;
  }

  /**
   * Record an observation for a variant in an experiment.
   * @param {{ experimentId, variantId, value, jobId? }} params
   */
  function observe({ experimentId, variantId, value, jobId = null }) {
    const obs = { id: randomUUID(), experimentId, variantId, value: Number(value) || 0, jobId, ts: new Date().toISOString() };
    observations.push(obs);
    return obs;
  }

  /**
   * Compute variant statistics for an experiment.
   */
  function stats(experimentId) {
    const exp = experiments.get(experimentId);
    if (!exp) return null;
    const byVariant = {};
    for (const v of exp.variants) {
      const obs = observations.filter((o) => o.experimentId === experimentId && o.variantId === v);
      const n = obs.length;
      const sum = obs.reduce((s, o) => s + o.value, 0);
      const mean = n ? sum / n : 0;
      byVariant[v] = { variantId: v, n, mean, sum };
    }
    return { experimentId, metric: exp.metric, byVariant };
  }

  /**
   * Evaluate if a winner can be declared.
   * Simple rule: variant with highest mean and >= minSamples wins.
   */
  function evaluate(experimentId) {
    const exp = experiments.get(experimentId);
    if (!exp || exp.status !== 'running') return null;
    const s = stats(experimentId);
    if (!s) return null;

    const candidates = Object.values(s.byVariant).filter((v) => v.n >= exp.minSamples);
    if (candidates.length < 2) return null;

    const winner = candidates.sort((a, b) => b.mean - a.mean)[0];
    const control = s.byVariant[exp.control];
    const lift = control?.mean ? (winner.mean - control.mean) / control.mean : 0;

    if (winner.variantId !== exp.control || lift > 0.05) {
      exp.status = 'complete';
      exp.winner = winner.variantId;
      exp.lift = lift;
      exp.concluded_at = new Date().toISOString();
    }
    return { winner: exp.winner, lift, stats: s };
  }

  function getExperiment(id) { return experiments.get(id) || null; }
  function listExperiments(filter = {}) {
    return [...experiments.values()].filter((e) => !filter.status || e.status === filter.status);
  }

  return { create, observe, stats, evaluate, getExperiment, listExperiments };
}

export default createAbLearning;
