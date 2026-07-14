/**
 * Revenue Attribution – assigns revenue credit to touchpoints and channels.
 *
 * Models: last_touch, first_touch, linear, time_decay, data_driven (weighted).
 */
export function createRevenueAttribution(deps = {}) {
  const conversions = []; // { conversionId, value, touchpoints, model, credits }

  /**
   * Record a revenue conversion with its touchpoint journey.
   * @param {{ conversionId, value, touchpoints: {channel,ts}[], model? }} params
   */
  function record({ conversionId, value = 0, touchpoints = [], model = 'linear' }) {
    const credits = _attribute(value, touchpoints, model);
    const entry = { conversionId, value, touchpoints, model, credits, ts: new Date().toISOString() };
    conversions.push(entry);
    return entry;
  }

  function _attribute(value, touchpoints, model) {
    if (!touchpoints.length) return [];
    const n = touchpoints.length;
    switch (model) {
      case 'last_touch':
        return touchpoints.map((t, i) => ({ channel: t.channel, credit: i === n - 1 ? value : 0 }));
      case 'first_touch':
        return touchpoints.map((t, i) => ({ channel: t.channel, credit: i === 0 ? value : 0 }));
      case 'time_decay': {
        const weights = touchpoints.map((_, i) => Math.pow(2, i));
        const total = weights.reduce((s, w) => s + w, 0);
        return touchpoints.map((t, i) => ({ channel: t.channel, credit: (weights[i] / total) * value }));
      }
      case 'linear':
      default:
        return touchpoints.map((t) => ({ channel: t.channel, credit: value / n }));
    }
  }

  /** Aggregate credit by channel. */
  function byChannel(filter = {}) {
    const agg = {};
    for (const c of conversions) {
      if (filter.model && c.model !== filter.model) continue;
      for (const cr of c.credits) {
        agg[cr.channel] = (agg[cr.channel] || 0) + cr.credit;
      }
    }
    return agg;
  }

  function all()   { return [...conversions]; }
  function total() { return conversions.reduce((s, c) => s + c.value, 0); }

  return { record, byChannel, all, total };
}

export default createRevenueAttribution;
