import { isOptimizationEnabled } from './config.js';
import { createPromptOptimizer } from './promptOptimizer.js';
import { createCreativeOptimizer } from './creativeOptimizer.js';
import { createTemplateOptimizer } from './templateOptimizer.js';
import { createModelOptimizer } from './modelOptimizer.js';
import { createCostOptimizer } from './costOptimizer.js';
import { createLatencyOptimizer } from './latencyOptimizer.js';
import { createQualityOptimizer } from './qualityOptimizer.js';
import { createPipelineOptimizer } from './pipelineOptimizer.js';
import { createPublishOptimizer } from './publishOptimizer.js';
import { createBudgetOptimizer } from './budgetOptimizer.js';
import { createAutoRecommendation } from './autoRecommendation.js';
import { createAutoTuning } from './autoTuning.js';
import { createExperimentOptimizer } from './experimentOptimizer.js';
import { createDecisionEngine } from './decisionEngine.js';

/**
 * Create the full Optimization Engine.
 *
 * Deps accepted (all optional, falls back to stubs):
 *   - from Learning:   promptLearning, promptVersioning, creativeLearning, policyLearning,
 *                      modelEvaluation, trendDetection, qualityLearning, abLearning
 *   - from Analytics:  kpiCalculator, publishHistory
 *   - from Publish:    publishHistory
 *
 * @param {object} deps
 * @returns {OptimizationEngine}
 */
export function createOptimizationEngine(deps = {}) {
  if (!isOptimizationEnabled()) {
    return {
      enabled: false,
      prompt: null, creative: null, template: null,
      model: null, cost: null, latency: null, quality: null,
      pipeline: null, publish: null, budget: null,
      recommendations: null, autoTuning: null, experiments: null, decision: null,
    };
  }

  // ── Layer 1: primitive optimizers ──────────────────────────────────────────
  const model    = createModelOptimizer({ modelEvaluation: deps.modelEvaluation });
  const latency  = createLatencyOptimizer();
  const template = createTemplateOptimizer({ creativeLearning: deps.creativeLearning });

  // ── Layer 2: compound optimizers (may use layer 1) ─────────────────────────
  const prompt   = createPromptOptimizer({
    promptLearning:   deps.promptLearning,
    promptVersioning: deps.promptVersioning,
    abLearning:       deps.abLearning,
  });
  const creative = createCreativeOptimizer({
    creativeLearning: deps.creativeLearning,
    trendDetection:   deps.trendDetection,
  });
  const cost = createCostOptimizer({
    kpiCalculator: deps.kpiCalculator,
    modelOptimizer: model,
  });
  const quality = createQualityOptimizer({
    qualityLearning: deps.qualityLearning,
    modelOptimizer:  model,
  });
  const pipeline = createPipelineOptimizer({ latencyOptimizer: latency });
  const publish  = createPublishOptimizer({
    publishHistory:  deps.publishHistory,
    audienceLearning: deps.audienceLearning,
    trendDetection:  deps.trendDetection,
  });
  const budget = createBudgetOptimizer({ kpiCalculator: deps.kpiCalculator });

  // ── Layer 3: meta-optimizers ───────────────────────────────────────────────
  const recommendations = createAutoRecommendation({
    promptOptimizer:  prompt,
    creativeOptimizer: creative,
    costOptimizer:    cost,
    latencyOptimizer: latency,
    publishOptimizer: publish,
  });
  const autoTuning = createAutoTuning({
    templateOptimizer: template,
    pipelineOptimizer: pipeline,
    promptOptimizer:   prompt,
  });
  const experiments = createExperimentOptimizer({
    abLearning:      deps.abLearning,
    creativeLearning: deps.creativeLearning,
    promptLearning:  deps.promptLearning,
  });
  const decision = createDecisionEngine();

  /**
   * Run a full optimization cycle and return the recommendation report.
   * Called by Runtime on a schedule (e.g., daily batch) or on-demand.
   *
   * @param {object} context – { platform?, taskType?, skillId?, kpis?, currentModel? }
   * @returns {object} optimization report
   */
  async function runCycle(context = {}) {
    // 1. Generate recommendations
    const report = recommendations.generate(context);

    // 2. Auto-apply safe changes if enabled
    const tuningResult = autoTuning.processBatch(report.recommendations);

    // 3. Propose new experiments
    const expProposals = experiments.proposeExperiments();

    // 4. Evaluate running experiments
    const expResults = experiments.evaluateRunning();

    // 5. Decision Engine: select best overall strategy
    const strategies = {
      optimize_quality: { quality: 0.9, cost: 0.3, latency: 0.5, reach: 0.6 },
      optimize_cost:    { quality: 0.6, cost: 0.9, latency: 0.5, reach: 0.5 },
      optimize_reach:   { quality: 0.7, cost: 0.5, latency: 0.5, reach: 0.9 },
      balanced:         { quality: 0.75, cost: 0.6, latency: 0.6, reach: 0.7 },
    };
    const strategyDecision = decision.selectStrategy(strategies);

    return {
      cycle: new Date().toISOString(),
      recommendations: report,
      autoTuning: tuningResult,
      experiments: { proposed: expProposals.proposals, closed: expResults.closed },
      strategy: strategyDecision,
    };
  }

  return {
    enabled: true,
    // optimizers
    prompt, creative, template, model, cost, latency, quality, pipeline, publish, budget,
    // meta
    recommendations, autoTuning, experiments, decision,
    // cycle
    runCycle,
  };
}

export default createOptimizationEngine;
