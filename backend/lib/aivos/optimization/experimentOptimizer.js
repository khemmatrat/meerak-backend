/**
 * Experiment Optimizer – designs, prioritises, and closes A/B experiments
 * for continuous optimisation of prompts, templates, and models.
 *
 * Works with the Learning Engine's A/B learning module.
 */
export function createExperimentOptimizer(deps = {}) {
  const abLearning = deps.abLearning || null;
  const creativeLearning = deps.creativeLearning || null;
  const promptLearning = deps.promptLearning || null;

  const proposals = [];

  /**
   * Propose new experiments based on gaps in learning coverage.
   * @returns {{ proposals: object[] }}
   */
  function proposeExperiments() {
    const newProposals = [];

    // Propose prompt experiments for poorly tracked prompts
    if (promptLearning) {
      const lowPerformers = promptLearning.listProposals({ status: 'pending' }).slice(0, 3);
      for (const lp of lowPerformers) {
        newProposals.push({
          type: 'prompt',
          name: `prompt_ab_${lp.promptId}_${Date.now()}`,
          control: lp.promptId,
          metric: 'ctr',
          reason: 'pending_evolution',
          priority: 'high',
          proposedAt: new Date().toISOString(),
        });
      }
    }

    // Propose template experiments for untested templates
    if (creativeLearning) {
      const ranked = creativeLearning.rankTemplates(5);
      const untested = ranked.filter((t) => t.sampleSize < 5).slice(0, 2);
      for (const u of untested) {
        newProposals.push({
          type: 'template',
          name: `template_ab_${u.templateId}_${Date.now()}`,
          control: u.templateId,
          metric: 'ctr',
          reason: 'low_sample_size',
          priority: 'medium',
          proposedAt: new Date().toISOString(),
        });
      }
    }

    proposals.push(...newProposals);
    return { proposals: newProposals };
  }

  /**
   * Evaluate running experiments and close winners.
   * @returns {{ closed: object[] }}
   */
  function evaluateRunning() {
    if (!abLearning) return { closed: [] };
    const closed = [];
    const running = abLearning.listExperiments({ status: 'running' });
    for (const exp of running) {
      const result = abLearning.evaluate(exp.id);
      if (result.winner) {
        closed.push({ experimentId: exp.id, winner: result.winner, reason: 'significant_winner' });
      }
    }
    return { closed };
  }

  function listProposals() { return [...proposals]; }

  return { proposeExperiments, evaluateRunning, listProposals };
}

export default createExperimentOptimizer;
