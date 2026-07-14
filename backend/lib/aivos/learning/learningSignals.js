import { randomUUID } from 'crypto';

/**
 * Learning Signals – weighted signal storage per published job.
 *
 * Spec weights (from LEARNING_ENGINE_SPEC.md §2):
 *   CTR            0.20
 *   Watch Time     0.25
 *   Completion     0.20
 *   Likes/Shares   0.15
 *   Quality        0.20
 *
 * Only published jobs enter the learning pool; drafts are excluded.
 */

const SIGNAL_WEIGHTS = Object.freeze({
  ctr: 0.20,
  watch_time: 0.25,
  completion_rate: 0.20,
  engagement: 0.15,   // likes + shares combined
  quality: 0.20,
});

export function createLearningSignals(deps = {}) {
  /** Raw signal records: { id, jobId, skillId, promptId, templateId, signal, value, ts } */
  const records = [];
  /** Aggregate cache: jobId -> { ctr, watch_time, completion_rate, engagement, quality, weighted_score } */
  const aggregates = new Map();

  /**
   * Ingest a learning signal from a published job.
   * @param {{ jobId, skillId?, promptId?, templateId?, signal, value }} params
   */
  function ingest({ jobId, skillId = null, promptId = null, templateId = null, signal, value }) {
    if (!SIGNAL_WEIGHTS[signal]) return null;   // unknown signal – ignore
    const record = {
      id: randomUUID(),
      jobId,
      skillId,
      promptId,
      templateId,
      signal,
      value: Number(value) || 0,
      weight: SIGNAL_WEIGHTS[signal],
      ts: new Date().toISOString(),
    };
    records.push(record);
    _rebuildAggregate(jobId);
    return record;
  }

  /** Ingest multiple signals at once (from analytics snapshot). */
  function ingestFromKpis(jobId, kpis = {}, meta = {}) {
    const mapped = {
      ctr: kpis.ctr ?? null,
      watch_time: kpis.avg_watch_seconds != null ? Math.min(kpis.avg_watch_seconds / 60, 1) : null,
      completion_rate: kpis.retention_30s ?? null,
      engagement: kpis.ctr != null && kpis.conversion_rate != null
        ? (kpis.ctr + kpis.conversion_rate) / 2
        : null,
      quality: kpis.hook_score ?? null,
    };
    const ingested = [];
    for (const [signal, value] of Object.entries(mapped)) {
      if (value !== null) {
        ingested.push(ingest({ jobId, signal, value, ...meta }));
      }
    }
    return ingested;
  }

  function _rebuildAggregate(jobId) {
    const jobRecords = records.filter((r) => r.jobId === jobId);
    const bySignal = {};
    for (const r of jobRecords) {
      if (!bySignal[r.signal]) bySignal[r.signal] = [];
      bySignal[r.signal].push(r.value);
    }
    let weightedScore = 0;
    for (const [signal, values] of Object.entries(bySignal)) {
      const avg = values.reduce((s, v) => s + v, 0) / values.length;
      weightedScore += avg * (SIGNAL_WEIGHTS[signal] || 0);
    }
    aggregates.set(jobId, { ...bySignal, weighted_score: weightedScore, updated_at: new Date().toISOString() });
  }

  /** Get aggregate for a job. */
  function getAggregate(jobId) {
    return aggregates.get(jobId) || null;
  }

  /** Rank jobs by weighted_score descending. */
  function topJobs(n = 10) {
    return [...aggregates.entries()]
      .map(([jobId, agg]) => ({ jobId, weighted_score: agg.weighted_score }))
      .sort((a, b) => b.weighted_score - a.weighted_score)
      .slice(0, n);
  }

  function list(filter = {}) {
    return records.filter((r) => {
      if (filter.jobId && r.jobId !== filter.jobId) return false;
      if (filter.signal && r.signal !== filter.signal) return false;
      if (filter.skillId && r.skillId !== filter.skillId) return false;
      return true;
    });
  }

  return { ingest, ingestFromKpis, getAggregate, topJobs, list, SIGNAL_WEIGHTS };
}

export default createLearningSignals;
