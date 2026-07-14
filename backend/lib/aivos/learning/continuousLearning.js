/**
 * Continuous Learning – event-driven background batch loop.
 *
 * Consumes ACP events from the Runtime bus, accumulates signals,
 * and triggers batch processing on a configurable schedule or signal threshold.
 *
 * "batch-oriented — never blocks pipeline hot path" (LEARNING_ENGINE_SPEC §1)
 */
export function createContinuousLearning(deps = {}) {
  const feedbackLoop = deps.feedbackLoop;
  const signals = deps.signals;
  const events = deps.events;
  const trendDetection = deps.trendDetection;
  const analyticsEngine = deps.analyticsEngine;

  let pendingCount = 0;
  let totalBatches = 0;
  let lastRunAt = null;
  const batchLog = [];

  /**
   * Consume an ACP event and extract learning signals from it.
   * Called automatically when wired to runtime.events.emit.
   */
  function consumeEvent(envelope) {
    const name = envelope?.name;
    const payload = envelope?.payload || {};

    if (name === 'aivos.publish.completed') {
      pendingCount += 1;
      if (trendDetection) {
        const platforms = payload.success || [];
        for (const platform of platforms) {
          trendDetection.record(`publish.${platform}`, 1);
        }
        trendDetection.record('publish.total', platforms.length);
      }
    }

    if (name === 'aivos.learning.feedback.processed') {
      const trends = trendDetection ? trendDetection.allTrends() : [];
      batchLog.push({ ts: new Date().toISOString(), processed: payload.processed, proposals: payload.proposals, trends: trends.filter((t) => t.trend !== 'stable').length });
    }
  }

  /**
   * Run the batch processing cycle.
   * Should be called by a nightly Bull job or on threshold.
   */
  async function runBatch() {
    lastRunAt = new Date().toISOString();
    totalBatches += 1;
    let result = { processed: 0, proposals: 0 };

    if (feedbackLoop) {
      result = await feedbackLoop.processPending();
    }

    pendingCount = 0;

    if (events) {
      await events.emit({
        name: 'aivos.learning.batch.completed',
        correlationId: 'learning-batch',
        source: { agentId: 'learning' },
        payload: { batchNum: totalBatches, ...result },
      }).catch(() => {});
    }

    return { batchNum: totalBatches, ...result };
  }

  function status() {
    return {
      pending: pendingCount,
      totalBatches,
      lastRunAt,
      recentBatches: batchLog.slice(-5),
    };
  }

  return { consumeEvent, runBatch, status };
}

export default createContinuousLearning;
