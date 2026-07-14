import { randomUUID } from 'crypto';

/**
 * Quality Learning – correlates Quality Engine scores with downstream performance.
 *
 * Builds a model: quality_score → CTR + retention correlation.
 * Proposes quality threshold adjustments when low-quality content
 * consistently outperforms high-quality, or vice versa.
 */
export function createQualityLearning(deps = {}) {
  const records = [];
  const thresholds = { min_quality: 0.6 };

  function record({ jobId, qualityScore, kpis = {} }) {
    const entry = { id: randomUUID(), jobId, qualityScore, kpis, ts: new Date().toISOString() };
    records.push(entry);
    return entry;
  }

  /** Pearson correlation between quality score and a KPI field. */
  function correlation(kpiField) {
    const pairs = records.filter((r) => r.qualityScore != null && r.kpis[kpiField] != null)
      .map((r) => ({ x: r.qualityScore, y: r.kpis[kpiField] }));
    if (pairs.length < 3) return null;
    const n = pairs.length;
    const meanX = pairs.reduce((s, p) => s + p.x, 0) / n;
    const meanY = pairs.reduce((s, p) => s + p.y, 0) / n;
    const num = pairs.reduce((s, p) => s + (p.x - meanX) * (p.y - meanY), 0);
    const denX = Math.sqrt(pairs.reduce((s, p) => s + (p.x - meanX) ** 2, 0));
    const denY = Math.sqrt(pairs.reduce((s, p) => s + (p.y - meanY) ** 2, 0));
    return denX * denY === 0 ? 0 : num / (denX * denY);
  }

  /** Suggest a quality threshold adjustment based on observed correlations. */
  function suggestThreshold() {
    const ctrCorr = correlation('ctr');
    if (ctrCorr === null) return null;
    if (ctrCorr < 0.1) {
      return { action: 'lower_threshold', current: thresholds.min_quality, suggested: 0.5, reason: 'weak_quality_ctr_correlation' };
    }
    if (ctrCorr > 0.7) {
      return { action: 'raise_threshold', current: thresholds.min_quality, suggested: 0.75, reason: 'strong_quality_ctr_correlation' };
    }
    return null;
  }

  function getThresholds() { return { ...thresholds }; }
  function setThreshold(key, value) { thresholds[key] = value; }

  return { record, correlation, suggestThreshold, getThresholds, setThreshold };
}

export default createQualityLearning;
