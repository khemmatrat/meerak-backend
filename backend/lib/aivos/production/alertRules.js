import { ALERT_THRESHOLDS } from './config.js';

export function createAlertRules({ thresholds = ALERT_THRESHOLDS } = {}) {
  return {
    evaluate(metrics = {}) {
      const alerts = [];

      const errorRate = Number(metrics.errorRate ?? 0);
      if (errorRate > thresholds.errorRate) {
        alerts.push({
          id:       'high_error_rate',
          severity: 'critical',
          message:  `Error rate ${errorRate} exceeds threshold ${thresholds.errorRate}`,
          value:    errorRate,
          threshold: thresholds.errorRate,
        });
      }

      const p95 = Number(metrics.p95LatencyMs ?? 0);
      if (p95 > thresholds.p95LatencyMs) {
        alerts.push({
          id:       'high_p95_latency',
          severity: 'warning',
          message:  `p95 latency ${p95}ms exceeds threshold ${thresholds.p95LatencyMs}ms`,
          value:    p95,
          threshold: thresholds.p95LatencyMs,
        });
      }

      const depth = Number(metrics.queueDepth ?? 0);
      if (depth > thresholds.queueDepth) {
        alerts.push({
          id:       'queue_depth_exceeded',
          severity: 'warning',
          message:  `Queue depth ${depth} exceeds threshold ${thresholds.queueDepth}`,
          value:    depth,
          threshold: thresholds.queueDepth,
        });
      }

      return { ok: alerts.length === 0, alerts, evaluatedAt: new Date().toISOString() };
    },
  };
}
