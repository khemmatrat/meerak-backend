import { randomUUID } from 'crypto';

/**
 * Audience Segmentation – classifies jobs and users into segments
 * based on performance patterns, content type, and platform behaviour.
 *
 * Segments: 'high_ctr', 'long_watch', 'quick_convert', 'brand_aware', 'unknown'
 */
export function createAudienceSegmentation(deps = {}) {
  const RULES = [
    { segmentId: 'high_ctr',      test: (k) => (k.ctr || 0) > 0.15 },
    { segmentId: 'long_watch',    test: (k) => (k.avg_watch_seconds || 0) > 45 },
    { segmentId: 'quick_convert', test: (k) => (k.conversion_rate || 0) > 0.05 },
    { segmentId: 'brand_aware',   test: (k) => (k.hook_score || 0) > 0.7 && (k.retention_30s || 0) > 0.3 },
  ];

  const assignments = new Map();

  /** Classify a job into one or more segments based on kpis. */
  function classify(jobId, kpis = {}) {
    const matched = RULES.filter((r) => r.test(kpis)).map((r) => r.segmentId);
    const segments = matched.length > 0 ? matched : ['unknown'];
    assignments.set(jobId, { jobId, segments, kpis, classified_at: new Date().toISOString() });
    return segments;
  }

  /** Get segment assignment for a job. */
  function getAssignment(jobId) {
    return assignments.get(jobId) || null;
  }

  /** List all jobs in a segment. */
  function jobsInSegment(segmentId) {
    return [...assignments.values()].filter((a) => a.segments.includes(segmentId)).map((a) => a.jobId);
  }

  /** Segment distribution stats. */
  function stats() {
    const counts = {};
    for (const a of assignments.values()) {
      for (const s of a.segments) {
        counts[s] = (counts[s] || 0) + 1;
      }
    }
    return { total: assignments.size, bySegment: counts };
  }

  return { classify, getAssignment, jobsInSegment, stats };
}

export default createAudienceSegmentation;
