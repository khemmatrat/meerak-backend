import { isLearningEnabled } from './config.js';
import { createLearningSignals } from './learningSignals.js';
import { createFeedbackLoop } from './feedbackLoop.js';
import { createPromptLearning } from './promptLearning.js';
import { createPromptVersioning } from './promptVersioning.js';
import { createCreativeLearning } from './creativeLearning.js';
import { createPolicyLearning } from './policyLearning.js';
import { createModelEvaluation } from './modelEvaluation.js';
import { createBrandLearning } from './brandLearning.js';
import { createAudienceLearning } from './audienceLearning.js';
import { createAudienceSegmentation } from './audienceSegmentation.js';
import { createCohortAnalysis } from './cohortAnalysis.js';
import { createTrendDetection } from './trendDetection.js';
import { createQualityLearning } from './qualityLearning.js';
import { createAbLearning } from './abLearning.js';
import { createAttribution } from './attribution.js';
import { createMemoryUpdate } from './memoryUpdate.js';
import { createContinuousLearning } from './continuousLearning.js';

export { createLearningSignals } from './learningSignals.js';
export { createFeedbackLoop } from './feedbackLoop.js';
export { createPromptLearning } from './promptLearning.js';
export { createPromptVersioning } from './promptVersioning.js';
export { createCreativeLearning } from './creativeLearning.js';
export { createPolicyLearning } from './policyLearning.js';
export { createModelEvaluation } from './modelEvaluation.js';
export { createBrandLearning } from './brandLearning.js';
export { createAudienceLearning } from './audienceLearning.js';
export { createAudienceSegmentation } from './audienceSegmentation.js';
export { createCohortAnalysis } from './cohortAnalysis.js';
export { createTrendDetection } from './trendDetection.js';
export { createQualityLearning } from './qualityLearning.js';
export { createAbLearning } from './abLearning.js';
export { createAttribution } from './attribution.js';
export { createMemoryUpdate } from './memoryUpdate.js';
export { createContinuousLearning } from './continuousLearning.js';

/**
 * createLearningEngine – main factory wiring all learning sub-components.
 *
 * Returns a disabled stub when AIVOS_LEARNING_ENABLED is falsy.
 * The stub preserves the legacy ingestPublishedJob() API for backward compatibility.
 *
 * Exposes:
 *   engine.signals         → LearningSignals
 *   engine.feedback        → FeedbackLoop
 *   engine.promptLearning  → PromptLearning
 *   engine.promptVersioning→ PromptVersioning
 *   engine.creative        → CreativeLearning
 *   engine.policy          → PolicyLearning
 *   engine.modelEval       → ModelEvaluation
 *   engine.brand           → BrandLearning
 *   engine.audience        → AudienceLearning
 *   engine.segmentation    → AudienceSegmentation
 *   engine.cohort          → CohortAnalysis
 *   engine.trends          → TrendDetection
 *   engine.quality         → QualityLearning
 *   engine.ab              → AbLearning
 *   engine.attribution     → Attribution
 *   engine.memory          → MemoryUpdate
 *   engine.continuous      → ContinuousLearning
 *   engine.ingestPublishedJob(params) → submit feedback for a completed job
 *   engine.consumeEvent(envelope)     → forward ACP event to continuous learning
 */
export function createLearningEngine(deps = {}) {
  if (!isLearningEnabled()) {
    return {
      enabled: false,
      async ingestPublishedJob() {
        return { accepted: false, reason: 'learning_disabled' };
      },
      consumeEvent() {},
    };
  }

  const signals = createLearningSignals();

  const promptLearningModule = createPromptLearning({ store: deps.store });
  const creativeLearningModule = createCreativeLearning();
  const brandLearningModule = createBrandLearning();

  const feedback = createFeedbackLoop({
    signals,
    promptLearning: promptLearningModule,
    creativeLearning: creativeLearningModule,
    brandLearning: brandLearningModule,
    events: deps.events,
  });

  const promptVersioning = createPromptVersioning();
  const policy = createPolicyLearning();
  const modelEval = createModelEvaluation();
  const audience = createAudienceLearning();
  const segmentation = createAudienceSegmentation();
  const cohort = createCohortAnalysis();
  const trends = createTrendDetection();
  const quality = createQualityLearning();
  const ab = createAbLearning();
  const attribution = createAttribution();
  const memory = createMemoryUpdate({ kernel: deps.kernel });

  const continuous = createContinuousLearning({
    feedbackLoop: feedback,
    signals,
    events: deps.events,
    trendDetection: trends,
    analyticsEngine: deps.analyticsEngine,
  });

  /**
   * Main entry point: ingest a completed published job into the learning pool.
   * Only published jobs qualify (drafts excluded per spec).
   */
  async function ingestPublishedJob({ jobId, skillId = null, promptId = null, templateId = null, kpis = {}, publishResult = null, status = 'published' }) {
    if (status !== 'published') {
      return { accepted: false, reason: 'draft_excluded' };
    }

    const entry = await feedback.submit({ jobId, skillId, promptId, templateId, kpis, publishResult });

    // Segmentation
    segmentation.classify(jobId, kpis);

    // Cohort
    cohort.record({ jobId, kpis });

    // Trend signals
    trends.record('ctr', kpis.ctr || 0);
    trends.record('watch_time', kpis.avg_watch_seconds || 0);
    trends.record('hook_score', kpis.hook_score || 0);

    return { accepted: true, feedbackId: entry.id };
  }

  return {
    enabled: true,
    signals,
    feedback,
    promptLearning: promptLearningModule,
    promptVersioning,
    creative: creativeLearningModule,
    policy,
    modelEval,
    brand: brandLearningModule,
    audience,
    segmentation,
    cohort,
    trends,
    quality,
    ab,
    attribution,
    memory,
    continuous,
    ingestPublishedJob,
    consumeEvent: continuous.consumeEvent,
  };
}

export default createLearningEngine;
