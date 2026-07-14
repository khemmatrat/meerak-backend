export function createKnowledgeMetrics() {
  const queries = [];
  let memoryBytes = 0;

  return {
    recordQuery({ latencyMs = 0, hit = false, recall = 0 } = {}) {
      queries.push({ latencyMs, hit, recall, at: new Date().toISOString() });
      return { latencyMs, hit, recall };
    },

    setMemoryUsage(bytes) {
      memoryBytes = bytes;
    },

    getStats() {
      const total = queries.length;
      const hits = queries.filter((q) => q.hit).length;
      const latencySum = queries.reduce((s, q) => s + q.latencyMs, 0);
      const recallSum = queries.reduce((s, q) => s + q.recall, 0);
      return {
        queryCount:    total,
        avgLatencyMs:  total ? latencySum / total : 0,
        hitRate:       total ? hits / total : 0,
        avgRecall:     total ? recallSum / total : 0,
        memoryUsage:   memoryBytes,
      };
    },
  };
}
