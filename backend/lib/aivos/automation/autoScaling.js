/**
 * Auto Scaling – monitors queue depth / latency and recommends or applies
 * concurrency adjustments for the pipeline worker pool.
 *
 * In production this would adjust Bull worker concurrency; here it
 * maintains a recommended concurrency value and an event log.
 */
export function createAutoScaling(deps = {}) {
  const auditLog = deps.automationAudit || null;
  const MIN_CONCURRENCY = 1;
  const MAX_CONCURRENCY = parseInt(process.env.AIVOS_MAX_WORKERS || '20', 10);

  let currentConcurrency = parseInt(process.env.AIVOS_WORKERS || '4', 10);
  const observations = [];
  const decisions    = [];

  /**
   * Record a queue depth / latency observation.
   * @param {{ queueDepth, avgLatencyMs, errorRate }} metrics
   */
  function observe({ queueDepth = 0, avgLatencyMs = 0, errorRate = 0 }) {
    observations.push({ queueDepth, avgLatencyMs, errorRate, ts: new Date().toISOString() });
  }

  /**
   * Evaluate recent observations and return a scaling decision.
   * @returns {{ action: 'scale_up'|'scale_down'|'maintain', recommended, reason }}
   */
  function evaluate() {
    if (observations.length === 0) return { action: 'maintain', recommended: currentConcurrency, reason: 'no_data' };

    const recent = observations.slice(-5);
    const avgDepth   = recent.reduce((s, o) => s + o.queueDepth, 0) / recent.length;
    const avgLatency = recent.reduce((s, o) => s + o.avgLatencyMs, 0) / recent.length;
    const avgError   = recent.reduce((s, o) => s + o.errorRate, 0) / recent.length;

    let action = 'maintain';
    let recommended = currentConcurrency;
    let reason = 'within_bounds';

    if (avgDepth > currentConcurrency * 2 && avgError < 0.1) {
      recommended = Math.min(MAX_CONCURRENCY, Math.ceil(currentConcurrency * 1.5));
      action = 'scale_up';
      reason = 'queue_depth_high';
    } else if (avgDepth < currentConcurrency * 0.3 && avgLatency < 500) {
      recommended = Math.max(MIN_CONCURRENCY, Math.floor(currentConcurrency * 0.7));
      action = 'scale_down';
      reason = 'queue_depth_low';
    } else if (avgError > 0.2) {
      recommended = Math.max(MIN_CONCURRENCY, currentConcurrency - 1);
      action = 'scale_down';
      reason = 'high_error_rate';
    }

    const decision = { action, from: currentConcurrency, recommended, reason, ts: new Date().toISOString() };
    decisions.push(decision);
    if (auditLog) auditLog.log({ type: 'auto_scaling', ...decision });

    if (action !== 'maintain') currentConcurrency = recommended;
    return decision;
  }

  function getConcurrency() { return currentConcurrency; }
  function getHistory()     { return [...decisions]; }

  return { observe, evaluate, getConcurrency, getHistory };
}

export default createAutoScaling;
