/**
 * AQOND Experience Engine — public entry (Sprint 30a)
 *
 * Jarvis, AI Director, FTX, and product surfaces should call
 * createExperienceRuntime() — not individual product APIs cross-wired.
 */

import { createExperienceEngine } from './experienceEngine.js';
import { createIntentEngine } from './intentEngine.js';
import { createLifecycleEngine } from './lifecycleEngine.js';
import { createPersonalizationEngine } from './personalizationEngine.js';
import { createAiMemoryEngine } from './aiMemoryEngine.js';
import { createRecommendationEngine } from './recommendationEngine.js';
import { createGrowthDecisionEngine } from './growthDecisionEngine.js';
import { createFeatureGateEngine } from './featureGateEngine.js';

export {
  createExperienceEngine,
  isExperienceEnabled,
} from './experienceEngine.js';

export { LIFECYCLE_STAGES } from './lifecycleEngine.js';
export { INTENT_SURFACES } from './intentEngine.js';

/**
 * @param {object} deps
 * @param {import('pg').Pool} [deps.pool]
 * @param {object} [deps.growthEngine]
 */
export function createExperienceRuntime(deps = {}) {
  const featureGateEngine = createFeatureGateEngine(deps);
  const intentEngine = createIntentEngine(deps);
  const lifecycleEngine = createLifecycleEngine(deps);
  const personalizationEngine = createPersonalizationEngine(deps);
  const aiMemoryEngine = createAiMemoryEngine(deps);
  const recommendationEngine = createRecommendationEngine(deps);
  const growthDecisionEngine = createGrowthDecisionEngine(deps);

  const experienceEngine = createExperienceEngine({
    ...deps,
    intentEngine,
    lifecycleEngine,
    personalizationEngine,
    aiMemoryEngine,
    recommendationEngine,
    growthDecisionEngine,
    featureGateEngine,
  });

  return {
    experienceEngine,
    intentEngine,
    lifecycleEngine,
    personalizationEngine,
    aiMemoryEngine,
    recommendationEngine,
    growthDecisionEngine,
    featureGateEngine,
  };
}
