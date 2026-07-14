/**
 * Prompt Composition Engine — Phase 2
 * Provider / language / industry / style / campaign agnostic composition from config.
 */

import {
  buildPromptComposeInput,
  composePromptFromDimensions,
  getPromptEngineInfo,
} from './promptComposer.js';

export { buildPromptComposeInput, composePromptFromDimensions, getPromptEngineInfo };

/**
 * Orchestrator-facing compose API.
 * @param {import('../types.js').DirectorRequest} request
 * @param {{ format: string, style?: object, script?: object, style_id?: string, category_id?: string, video_provider_id?: string }} context
 */
export function composePrompt(request, context) {
  const input = buildPromptComposeInput(request, {
    format: context.format,
    style: context.style,
    script: context.script,
    style_id: context.style_id,
    category_id: context.category_id,
    video_provider_id: context.video_provider_id,
  });
  return composePromptFromDimensions(input);
}

/**
 * Script Engine integration — re-compose when spoken script is available.
 * @param {import('./promptComposer.js').PromptComposeInput} baseInput
 * @param {{ full_text_th?: string }} script
 */
export function composePromptWithScript(baseInput, script) {
  return composePromptFromDimensions({
    ...baseInput,
    spoken_text: script?.full_text_th || baseInput.spoken_text,
  });
}
