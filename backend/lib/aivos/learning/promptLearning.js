import { randomUUID } from 'crypto';
import { isAutoApplyEnabled, maxVersionBumpsPerWeek } from './config.js';

/**
 * Prompt Learning – tracks prompt performance and generates evolution proposals.
 *
 * Proposals are staged in `aivos_prompt_evolution` (via store) pending admin approval
 * unless AIVOS_LEARNING_AUTO_APPLY=1.
 *
 * Anti-drift: max 1 version bump per skill per week (configurable).
 */
export function createPromptLearning(deps = {}) {
  const store = deps.store || null;

  /** In-memory performance ledger: promptId -> PerformanceEntry[] */
  const performance = new Map();
  /** Proposals waiting for approval */
  const proposals = [];
  /** Version bump log: skillId -> { weekKey -> count } */
  const bumpLog = new Map();

  /**
   * Record a prompt's observed performance from kpis.
   */
  function record(promptId, kpis = {}, meta = {}) {
    if (!promptId) return null;
    if (!performance.has(promptId)) performance.set(promptId, []);
    const entry = {
      promptId,
      score: _kpiScore(kpis),
      kpis,
      meta,
      ts: new Date().toISOString(),
    };
    performance.get(promptId).push(entry);
    return entry;
  }

  /**
   * Evaluate a prompt's current performance and determine if a proposal is warranted.
   * Returns a proposal object if the prompt is underperforming, else null.
   */
  function evaluatePerformance(promptId, kpis = {}) {
    record(promptId, kpis);
    const entries = performance.get(promptId) || [];
    if (entries.length < 3) return null; // need at least 3 data points

    const recent = entries.slice(-5);
    const avgScore = recent.reduce((s, e) => s + e.score, 0) / recent.length;

    if (avgScore < 0.4) {
      return _proposeEvolution(promptId, avgScore, 'underperforming');
    }
    if (avgScore > 0.8 && entries.length >= 10) {
      return _proposeEvolution(promptId, avgScore, 'top_performer_variant');
    }
    return null;
  }

  function _proposeEvolution(promptId, score, reason) {
    const skillId = promptId.replace(/-v\d+$/, '');
    if (!_canBump(skillId)) return null;

    const proposal = {
      id: randomUUID(),
      promptId,
      skillId,
      reason,
      score,
      status: isAutoApplyEnabled() ? 'auto_approved' : 'pending',
      created_at: new Date().toISOString(),
      approved_at: isAutoApplyEnabled() ? new Date().toISOString() : null,
    };
    proposals.push(proposal);

    if (isAutoApplyEnabled()) {
      _recordBump(skillId);
    }

    if (store) {
      store.insertPromptEvolution?.(proposal).catch(() => {});
    }
    return proposal;
  }

  function _kpiScore(kpis) {
    return (
      (kpis.ctr || 0) * 0.20 +
      Math.min((kpis.avg_watch_seconds || 0) / 60, 1) * 0.25 +
      (kpis.retention_30s || 0) * 0.20 +
      (kpis.conversion_rate || 0) * 0.15 +
      (kpis.hook_score || 0) * 0.20
    );
  }

  function _weekKey() {
    const d = new Date();
    const week = Math.floor(d.getTime() / (7 * 24 * 60 * 60 * 1000));
    return `${d.getFullYear()}-W${week}`;
  }

  function _canBump(skillId) {
    const wk = _weekKey();
    const log = bumpLog.get(skillId) || {};
    return (log[wk] || 0) < maxVersionBumpsPerWeek();
  }

  function _recordBump(skillId) {
    const wk = _weekKey();
    if (!bumpLog.has(skillId)) bumpLog.set(skillId, {});
    const log = bumpLog.get(skillId);
    log[wk] = (log[wk] || 0) + 1;
  }

  /** Approve a pending proposal by id. */
  function approve(proposalId) {
    const p = proposals.find((x) => x.id === proposalId);
    if (!p) return null;
    if (p.status !== 'pending') return p;
    p.status = 'approved';
    p.approved_at = new Date().toISOString();
    _recordBump(p.skillId);
    return p;
  }

  function listProposals(filter = {}) {
    return proposals.filter((p) => {
      if (filter.status && p.status !== filter.status) return false;
      if (filter.skillId && p.skillId !== filter.skillId) return false;
      return true;
    });
  }

  function getPerformance(promptId) {
    return performance.get(promptId) || [];
  }

  return { record, evaluatePerformance, approve, listProposals, getPerformance };
}

export default createPromptLearning;
