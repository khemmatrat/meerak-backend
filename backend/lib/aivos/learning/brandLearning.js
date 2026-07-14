import { randomUUID } from 'crypto';

/**
 * Brand Learning – observes performance signals and generates Brand DNA delta proposals.
 * Proposals require brand owner approval (never auto-applied unless LEARNING_AUTO_APPLY=1).
 */
export function createBrandLearning(deps = {}) {
  const observations = [];
  const proposals = [];

  function record({ brandKey, jobId, kpis = {}, publishResult = null }) {
    const entry = { id: randomUUID(), brandKey, jobId, kpis, publishResult, ts: new Date().toISOString() };
    observations.push(entry);
    return entry;
  }

  function evaluateSignals(jobId, kpis = {}) {
    const score = (kpis.ctr || 0) * 0.3 + (kpis.hook_score || 0) * 0.4 + (kpis.retention_30s || 0) * 0.3;
    if (score < 0.2) {
      const p = { id: randomUUID(), jobId, action: 'tone_adjust', reason: 'low_engagement', score, status: 'pending', created_at: new Date().toISOString() };
      proposals.push(p);
      return p;
    }
    return null;
  }

  function listProposals(filter = {}) {
    return proposals.filter((p) => !filter.status || p.status === filter.status);
  }

  return { record, evaluateSignals, listProposals };
}

export default createBrandLearning;
