/**
 * Pipeline Optimizer – recommends pipeline node configuration adjustments
 * to improve throughput, reduce failures, and optimize retry policies.
 */
export function createPipelineOptimizer(deps = {}) {
  const latencyOptimizer = deps.latencyOptimizer || null;

  const configs = new Map();
  const DEFAULT_CONFIG = { maxRetries: 2, timeoutMs: 30000, parallelizable: false };

  function getNodeConfig(nodeId) {
    return configs.get(nodeId) || { ...DEFAULT_CONFIG, nodeId };
  }

  /**
   * Analyse pipeline execution data and suggest node config changes.
   * @param {{ nodeStats: { nodeId, avgDurationMs, failureRate }[] }} analysis
   * @returns {{ suggestions: object[] }}
   */
  function suggest(analysis = {}) {
    const { nodeStats = [] } = analysis;
    const suggestions = [];

    for (const stat of nodeStats) {
      const current = getNodeConfig(stat.nodeId);

      // High failure rate → increase retries
      if ((stat.failureRate || 0) > 0.1 && current.maxRetries < 5) {
        suggestions.push({ nodeId: stat.nodeId, action: 'increase_retries', from: current.maxRetries, to: current.maxRetries + 1, reason: 'high_failure_rate' });
      }

      // Slow node → extend timeout
      if ((stat.avgDurationMs || 0) > current.timeoutMs * 0.8) {
        suggestions.push({ nodeId: stat.nodeId, action: 'extend_timeout', from: current.timeoutMs, to: current.timeoutMs * 1.5, reason: 'near_timeout' });
      }
    }

    // Include latency bottleneck suggestions
    if (latencyOptimizer) {
      const { suggestions: latSugg } = latencyOptimizer.suggest(3000);
      suggestions.push(...latSugg.map((s) => ({ ...s, source: 'latency_optimizer' })));
    }

    return { suggestions };
  }

  /** Apply suggested config to a node. */
  function apply(nodeId, patch) {
    const current = getNodeConfig(nodeId);
    configs.set(nodeId, { ...current, ...patch, updatedAt: new Date().toISOString() });
    return configs.get(nodeId);
  }

  return { getNodeConfig, suggest, apply };
}

export default createPipelineOptimizer;
