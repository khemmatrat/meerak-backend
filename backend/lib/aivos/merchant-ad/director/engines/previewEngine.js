import { resolveStyle } from './styleEngine.js';
import { estimateGenerationCost } from './costEstimationEngine.js';
import { validateDirectorRequest } from './validationEngine.js';
import { checkProviderCapabilities, resolveUgcBackendProvider } from '../providers/capabilities/capabilityLayer.js';
import { merchantAdAspectRatio } from '../../config.js';

/**
 * Merchant preview — script, prompt summary, duration, style, cost before generate.
 * @param {import('../types.js').DirectorRequest} request
 * @param {import('../types.js').DirectorPlan} plan
 * @param {object} [options]
 */
export async function buildMerchantPreview(request, plan, options = {}) {
  const style = plan.style || resolveStyle({ style_id: plan.style_id, format: plan.format });
  const providerId = resolveUgcBackendProvider(plan.video_provider_id || 'ugc_grok');
  const validation = await validateDirectorRequest(request, plan, {
    quota: options.quota,
    charge: options.charge,
    skip_token_check: options.skip_token_check,
  });
  const cost = estimateGenerationCost(request, plan, options.charge || {});
  const capabilities = checkProviderCapabilities(providerId, plan.format, {
    request,
    plan,
    aspect_ratio: merchantAdAspectRatio(),
    language: plan.prompt?.dimensions?.language,
  });

  const promptSummary = plan.prompt?.skipped
    ? { skipped: true, reason: plan.prompt.reason }
    : {
        preview: (plan.prompt?.video || '').slice(0, 280),
        spoken_text: plan.prompt?.spoken_text_slot || plan.script?.full_text_th || null,
        dimensions: plan.prompt?.dimensions || null,
        reproducibility_hash: plan.prompt?.reproducibility_hash || null,
      };

  return {
    script: {
      full_text: plan.script?.full_text_th || null,
      type: plan.script?.script_type || null,
      marketing_strategy: plan.script?.marketing_strategy?.primary_id || null,
      word_count: plan.script?.word_count || 0,
    },
    prompt_summary: promptSummary,
    duration: {
      clip_sec: capabilities.capabilities?.default_duration_sec || 10,
      estimated_wait_label: cost.estimated_duration_label,
      estimated_wait_sec: cost.estimated_duration_sec,
    },
    style: {
      id: plan.style_id,
      label_th: style?.label_th || plan.style_id,
    },
    cost,
    validation,
    capabilities,
    format: plan.format,
    video_provider_id: plan.video_provider_id,
    aspect_ratio: cost.aspect_ratio,
    resolution: cost.resolution,
    ready_to_generate: validation.ok && capabilities.ok,
  };
}
