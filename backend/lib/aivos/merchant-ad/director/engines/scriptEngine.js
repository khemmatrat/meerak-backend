/**
 * Script Strategy Engine — Phase 3
 * Business Context → Strategy → Psychology → Script Structure → Prompt Engine
 */

import { resolveBusinessContext } from './businessContext.js';
import { resolveMarketingStrategy } from './strategyEngine.js';
import { resolveEmotionalStrategy } from './psychologyEngine.js';
import { composeScript, getScriptEngineInfo } from './scriptComposer.js';
import { buildPromptComposeInput } from './promptComposer.js';

export {
  resolveBusinessContext,
  resolveMarketingStrategy,
  resolveEmotionalStrategy,
  composeScript,
  getScriptEngineInfo,
};

/**
 * Public API for orchestrator and Script Engine consumers.
 * @param {import('../types.js').DirectorRequest} request
 * @param {{ style_id: string, category_id: string, format?: string }} context
 */
export function generateScript(request, context) {
  const businessContext = resolveBusinessContext(request, context);
  const marketingStrategy = resolveMarketingStrategy(businessContext);
  const emotionalStrategy = resolveEmotionalStrategy(marketingStrategy);
  return composeScript({ businessContext, marketingStrategy, emotionalStrategy });
}

/**
 * Build script + prompt compose input for Prompt Engine handoff.
 */
export function buildScriptAndPromptInput(request, context) {
  const script = generateScript(request, context);
  const promptInput = buildPromptComposeInput(request, {
    format: context.format,
    style_id: context.style_id,
    category_id: context.category_id,
    script,
  });
  return { script, promptInput };
}
