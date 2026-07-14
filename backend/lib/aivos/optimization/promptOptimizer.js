/**
 * Prompt Optimizer – selects the best prompt version for a given skill/task
 * based on learning signal performance history.
 *
 * Input: promptLearning performance data + A/B experiment outcomes
 * Output: recommended promptId + version + confidence score
 */
export function createPromptOptimizer(deps = {}) {
  const promptLearning = deps.promptLearning || null;
  const abLearning = deps.abLearning || null;
  const promptVersioning = deps.promptVersioning || null;

  const overrides = new Map(); // skillId -> { promptId, version, confidence }

  /**
   * Select the optimal prompt for a skill.
   * @param {string} skillId
   * @param {{ taskType?, kpiTarget? }} options
   * @returns {{ promptId, version, confidence, source }}
   */
  function select(skillId, options = {}) {
    // Check manual overrides first
    if (overrides.has(skillId)) return overrides.get(skillId);

    // Check A/B winner
    if (abLearning) {
      const exps = abLearning.listExperiments({ status: 'complete' });
      const relevant = exps.find((e) => e.name.includes(skillId) && e.winner);
      if (relevant) {
        return { promptId: relevant.winner, version: null, confidence: 0.9, source: 'ab_winner' };
      }
    }

    // Check approved prompt evolutions
    if (promptLearning) {
      const approved = promptLearning.listProposals({ status: 'approved', skillId });
      if (approved.length > 0) {
        const best = approved.sort((a, b) => b.score - a.score)[0];
        return { promptId: best.promptId, version: null, confidence: 0.8, source: 'approved_evolution' };
      }
    }

    // Fall back to latest version
    if (promptVersioning) {
      const latest = promptVersioning.latest(skillId);
      if (latest) return { promptId: latest.promptId, version: latest.version, confidence: 0.6, source: 'latest_version' };
    }

    return { promptId: skillId, version: 1, confidence: 0.5, source: 'default' };
  }

  /** Force a specific prompt for a skill (used by auto-tuning). */
  function override(skillId, promptId, version, confidence = 0.9) {
    overrides.set(skillId, { promptId, version, confidence, source: 'override' });
  }

  function clearOverride(skillId) { overrides.delete(skillId); }

  return { select, override, clearOverride };
}

export default createPromptOptimizer;
