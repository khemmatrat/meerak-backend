import { randomUUID } from 'crypto';

export function createObservability({ store }) {
  // Legacy node-level spans (timeline-aligned)
  const legacySpans = [];
  // OTel-aligned span store keyed by spanId
  const otelSpans = new Map();

  /**
   * Start an OTel-aligned span.
   * Returns { traceId, spanId, name, start_time, attributes, runtimeJobId }
   */
  function startSpan({ traceId, parentSpanId = null, name, runtimeJobId, attributes = {} } = {}) {
    const span = {
      trace_id:       traceId || randomUUID(),
      span_id:        randomUUID(),
      parent_span_id: parentSpanId || null,
      name:           name || 'aivos.span',
      start_time:     new Date().toISOString(),
      end_time:       null,
      duration_ms:    null,
      attributes:     { ...attributes },
      runtime_job_id: runtimeJobId || null,
    };
    otelSpans.set(span.span_id, span);
    return { ...span };
  }

  /**
   * End a span by spanId. Attaches end_time, duration_ms, and optional extra attributes.
   */
  function endSpan(spanId, extraAttributes = {}) {
    const span = otelSpans.get(spanId);
    if (!span) return null;
    const end = new Date();
    span.end_time   = end.toISOString();
    span.duration_ms = end - new Date(span.start_time);
    Object.assign(span.attributes, extraAttributes);
    return { ...span };
  }

  /**
   * Return all OTel spans for a given runtime job, ordered by start_time.
   */
  function getJobTrace(runtimeJobId) {
    const result = [];
    for (const s of otelSpans.values()) {
      if (s.runtime_job_id === runtimeJobId) result.push({ ...s });
    }
    return result.sort((a, b) => a.start_time.localeCompare(b.start_time));
  }

  /**
   * Return all OTel spans sharing a trace_id.
   */
  function getTraceById(traceId) {
    const result = [];
    for (const s of otelSpans.values()) {
      if (s.trace_id === traceId) result.push({ ...s });
    }
    return result.sort((a, b) => a.start_time.localeCompare(b.start_time));
  }

  return {
    // ── OTel span API ─────────────────────────────────────────────
    startSpan,
    endSpan,
    getJobTrace,
    getTraceById,

    // ── Legacy timeline API (unchanged) ──────────────────────────
    async recordNodeStart({ jobId, nodeId, startedAt }) {
      await store.appendTimeline({
        job_id: jobId,
        node_id: nodeId,
        status: 'started',
        started_at: startedAt,
        metadata: {},
      });
      legacySpans.push({ jobId, nodeId, startedAt, type: 'node.start' });
    },
    async recordNodeComplete({ jobId, nodeId, completedAt, checkpointId }) {
      await store.appendTimeline({
        job_id: jobId,
        node_id: nodeId,
        status: 'completed',
        completed_at: completedAt,
        metadata: { checkpointId },
      });
      legacySpans.push({ jobId, nodeId, completedAt, type: 'node.complete' });
    },
    getTrace(jobId) {
      return legacySpans.filter((s) => s.jobId === jobId);
    },
    async getTimeline(jobId) {
      if (store.kind === 'memory') {
        return store._tables.timeline.filter((t) => t.job_id === jobId);
      }
      return [];
    },
  };
}
