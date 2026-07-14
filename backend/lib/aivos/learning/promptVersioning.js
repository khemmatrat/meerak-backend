import { randomUUID } from 'crypto';

/**
 * Prompt Versioning – manage prompt version lineage and proposals.
 *
 * Each prompt has a version history. Learning Engine creates evolution proposals;
 * Governance approves/rejects them. Prompt Compiler always reads the latest
 * approved version.
 */
export function createPromptVersioning(deps = {}) {
  /** Map: promptId -> VersionEntry[] (sorted by version asc) */
  const versions = new Map();
  /** Pending evolutions: proposalId -> proposal */
  const evolutions = new Map();

  /**
   * Register a new prompt version.
   * @param {{ promptId, version, template, reason?, source? }} params
   */
  function register({ promptId, version, template, reason = 'manual', source = 'system' }) {
    if (!versions.has(promptId)) versions.set(promptId, []);
    const entry = {
      id: randomUUID(),
      promptId,
      version,
      template,
      reason,
      source,
      status: 'active',
      created_at: new Date().toISOString(),
    };
    versions.get(promptId).push(entry);
    return entry;
  }

  /** Get the latest active version of a prompt. */
  function latest(promptId) {
    const hist = versions.get(promptId) || [];
    const active = hist.filter((v) => v.status === 'active');
    return active[active.length - 1] || null;
  }

  /** Get full version history for a prompt. */
  function history(promptId) {
    return versions.get(promptId) || [];
  }

  /**
   * Propose a new prompt version (from learning signal).
   * Goes into 'pending' state; must be approved before becoming active.
   * @param {{ promptId, baseVersion, proposedTemplate, reason, score }} params
   */
  function propose({ promptId, baseVersion, proposedTemplate, reason, score = 0 }) {
    const id = randomUUID();
    const proposal = {
      id,
      promptId,
      baseVersion,
      proposedTemplate,
      reason,
      score,
      status: 'pending',
      created_at: new Date().toISOString(),
      resolved_at: null,
    };
    evolutions.set(id, proposal);
    return proposal;
  }

  /** Approve an evolution proposal – creates a new active version. */
  function approveEvolution(proposalId) {
    const p = evolutions.get(proposalId);
    if (!p) return null;
    p.status = 'approved';
    p.resolved_at = new Date().toISOString();
    const newVersion = (p.baseVersion || 0) + 1;
    register({ promptId: p.promptId, version: newVersion, template: p.proposedTemplate, reason: p.reason, source: 'learning' });
    return { proposal: p, version: newVersion };
  }

  /** Reject a proposal. */
  function rejectEvolution(proposalId, reason = '') {
    const p = evolutions.get(proposalId);
    if (!p) return null;
    p.status = 'rejected';
    p.reject_reason = reason;
    p.resolved_at = new Date().toISOString();
    return p;
  }

  function listEvolutions(filter = {}) {
    return [...evolutions.values()].filter((p) => {
      if (filter.status && p.status !== filter.status) return false;
      if (filter.promptId && p.promptId !== filter.promptId) return false;
      return true;
    });
  }

  return { register, latest, history, propose, approveEvolution, rejectEvolution, listEvolutions };
}

export default createPromptVersioning;
