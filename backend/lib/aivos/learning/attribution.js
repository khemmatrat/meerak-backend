import { randomUUID } from 'crypto';

/**
 * Attribution – multi-touch attribution for conversions.
 *
 * Models:
 *   'last_touch'    – 100% credit to last touchpoint
 *   'first_touch'   – 100% credit to first touchpoint
 *   'linear'        – equal credit across all touchpoints
 *   'time_decay'    – more credit to recent touchpoints
 */
export function createAttribution(deps = {}) {
  /** conversionId -> { touchpoints, value, model } */
  const conversions = new Map();

  /**
   * Record a conversion with its touchpoint journey.
   * @param {{ jobId, touchpoints: [{channel, ts}], value, model? }} params
   */
  function record({ jobId, touchpoints = [], value = 1, model = 'linear' }) {
    const id = randomUUID();
    const conv = { id, jobId, touchpoints, value, model, recorded_at: new Date().toISOString() };
    conversions.set(id, conv);
    return conv;
  }

  /** Compute attribution credits for a conversion. */
  function attribute(conversionId) {
    const conv = conversions.get(conversionId);
    if (!conv || !conv.touchpoints.length) return null;

    const tps = conv.touchpoints;
    const n = tps.length;
    const model = conv.model;
    let weights;

    if (model === 'last_touch') {
      weights = tps.map((_, i) => i === n - 1 ? 1 : 0);
    } else if (model === 'first_touch') {
      weights = tps.map((_, i) => i === 0 ? 1 : 0);
    } else if (model === 'time_decay') {
      const raw = tps.map((_, i) => Math.pow(2, i));
      const total = raw.reduce((s, v) => s + v, 0);
      weights = raw.map((v) => v / total);
    } else {
      // linear
      weights = tps.map(() => 1 / n);
    }

    return tps.map((tp, i) => ({
      channel: tp.channel,
      ts: tp.ts,
      credit: conv.value * weights[i],
      weight: weights[i],
    }));
  }

  /** Aggregate credits per channel across all conversions. */
  function channelReport() {
    const channels = {};
    for (const conv of conversions.values()) {
      const credits = attribute(conv.id) || [];
      for (const c of credits) {
        if (!channels[c.channel]) channels[c.channel] = { channel: c.channel, totalCredit: 0, conversions: 0 };
        channels[c.channel].totalCredit += c.credit;
        channels[c.channel].conversions += c.weight;
      }
    }
    return Object.values(channels);
  }

  function list() { return [...conversions.values()]; }

  return { record, attribute, channelReport, list };
}

export default createAttribution;
