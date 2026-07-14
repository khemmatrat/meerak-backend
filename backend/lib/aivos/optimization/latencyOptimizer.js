/**
 * Latency Optimizer – identifies pipeline bottlenecks and suggests
 * parallelisation, caching, or node-skipping to reduce end-to-end time.
 */
export function createLatencyOptimizer(deps = {}) {
  const observations = [];

  /**
   * Record a node execution time.
   * @param {{ jobId, nodeId, durationMs }} params
   */
  function record({ jobId, nodeId, durationMs }) {
    observations.push({ jobId, nodeId, durationMs, ts: new Date().toISOString() });
  }

  /**
   * Identify bottleneck nodes (above threshold ms on average).
   * @param {number} thresholdMs
   * @returns {{ nodeId, avgDurationMs, sampleSize }[]}
   */
  function bottlenecks(thresholdMs = 2000) {
    const byNode = {};
    for (const o of observations) {
      if (!byNode[o.nodeId]) byNode[o.nodeId] = [];
      byNode[o.nodeId].push(o.durationMs);
    }
    return Object.entries(byNode)
      .map(([nodeId, times]) => ({
        nodeId,
        avgDurationMs: times.reduce((s, t) => s + t, 0) / times.length,
        sampleSize: times.length,
      }))
      .filter((n) => n.avgDurationMs >= thresholdMs)
      .sort((a, b) => b.avgDurationMs - a.avgDurationMs);
  }

  /**
   * Suggest latency optimizations for the identified bottlenecks.
   * @param {number} thresholdMs
   * @returns {{ suggestions: object[] }}
   */
  function suggest(thresholdMs = 2000) {
    const slow = bottlenecks(thresholdMs);
    const suggestions = slow.map((n) => {
      const action = n.avgDurationMs > 5000 ? 'parallelize' : n.avgDurationMs > 3000 ? 'cache_result' : 'reduce_tokens';
      return { nodeId: n.nodeId, action, avgDurationMs: n.avgDurationMs, estimatedSavingMs: n.avgDurationMs * 0.4 };
    });
    return { suggestions, totalBottlenecks: slow.length };
  }

  return { record, bottlenecks, suggest };
}

export default createLatencyOptimizer;
