export function isProductionModeEnabled() {
  return (
    process.env.AIVOS_PRODUCTION_MODE === '1' ||
    process.env.AIVOS_PRODUCTION_MODE === 'true'
  );
}

export const PRODUCTION_PHASE = 8;

export const ALERT_THRESHOLDS = {
  errorRate:      Number(process.env.AIVOS_ALERT_ERROR_RATE      || 0.05),
  p95LatencyMs:   Number(process.env.AIVOS_ALERT_P95_LATENCY_MS || 5000),
  queueDepth:     Number(process.env.AIVOS_ALERT_QUEUE_DEPTH     || 100),
};
