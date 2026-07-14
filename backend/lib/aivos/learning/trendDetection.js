import { randomUUID } from 'crypto';

/**
 * Trend Detection – identifies rising or falling patterns in content performance.
 *
 * Uses a simple linear regression over time-bucketed signal values.
 * Emits 'rising' / 'falling' / 'stable' trend labels for each tracked metric.
 */
export function createTrendDetection(deps = {}) {
  /** metric -> [{ ts, value }] */
  const series = new Map();

  function record(metric, value, ts = null) {
    if (!series.has(metric)) series.set(metric, []);
    series.get(metric).push({ ts: ts || new Date().toISOString(), value: Number(value) || 0 });
  }

  /** Simple slope via least-squares on the last N points. */
  function _slope(points) {
    const n = points.length;
    if (n < 2) return 0;
    const xs = points.map((_, i) => i);
    const ys = points.map((p) => p.value);
    const meanX = xs.reduce((s, x) => s + x, 0) / n;
    const meanY = ys.reduce((s, y) => s + y, 0) / n;
    const num = xs.reduce((s, x, i) => s + (x - meanX) * (ys[i] - meanY), 0);
    const den = xs.reduce((s, x) => s + (x - meanX) ** 2, 0);
    return den === 0 ? 0 : num / den;
  }

  /**
   * Get trend for a metric.
   * @param {string} metric
   * @param {number} window  Last N data points
   * @returns {{ metric, trend: 'rising'|'falling'|'stable', slope, samples }}
   */
  function getTrend(metric, window = 10) {
    const pts = (series.get(metric) || []).slice(-window);
    const slope = _slope(pts);
    const threshold = 0.005;
    const trend = slope > threshold ? 'rising' : slope < -threshold ? 'falling' : 'stable';
    return { metric, trend, slope, samples: pts.length };
  }

  /** Get trends for all tracked metrics. */
  function allTrends(window = 10) {
    return [...series.keys()].map((m) => getTrend(m, window));
  }

  /** List metrics with rising trend. */
  function rising(window = 10) {
    return allTrends(window).filter((t) => t.trend === 'rising');
  }

  return { record, getTrend, allTrends, rising };
}

export default createTrendDetection;
