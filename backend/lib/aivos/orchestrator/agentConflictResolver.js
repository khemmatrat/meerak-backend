export function createAgentConflictResolver({ governance, policyEngine } = {}) {
  function scoreCandidate(candidate) {
    let score = candidate.confidence ?? 0.5;
    if (candidate.priority != null) score += candidate.priority * 0.1;
    if (candidate.policyApproved) score += 0.2;
    if (candidate.governanceApproved) score += 0.3;
    return score;
  }

  return {
    resolve(key, candidates = []) {
      if (!candidates.length) return { key, winner: null, reason: 'no_candidates' };
      if (candidates.length === 1) {
        return { key, winner: candidates[0], reason: 'single_candidate', resolved: true };
      }

      const enriched = candidates.map((c) => ({
        ...c,
        policyApproved:    c.policyApproved ?? (policyEngine?.enabled !== false),
        governanceApproved: c.governanceApproved ?? (governance?.enabled === true),
        priority:          c.priority ?? 0,
      }));

      enriched.sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
      const winner = enriched[0];
      return {
        key,
        winner,
        resolved: true,
        reason:   'priority_confidence_policy_governance',
        rejected: enriched.slice(1).map((c) => c.agentId || c.skillId),
      };
    },

    mergeOutputs(outputsByKey = {}) {
      const merged = {};
      for (const [key, list] of Object.entries(outputsByKey)) {
        const candidates = Array.isArray(list) ? list : [list];
        merged[key] = this.resolve(key, candidates).winner;
      }
      return merged;
    },
  };
}
