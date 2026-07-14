import { merchantAdAspectRatio } from '../../config.js';
import { TOKENS_PER_VIDEO } from '../../tokenConfig.js';
import { estimateUgcDurationSec } from '../../estimates.js';
import { AD_FORMATS } from '../types.js';
import { getProviderCapability, resolveUgcBackendProvider } from '../providers/capabilities/capabilityLayer.js';

/**
 * @param {import('../types.js').DirectorRequest} request
 * @param {import('../types.js').DirectorPlan} plan
 * @param {object} [charge]
 */
export function estimateGenerationCost(request, plan, charge = {}) {
  const format = plan.format;
  const providerId = resolveUgcBackendProvider(plan.video_provider_id || 'ugc_grok');
  const caps = getProviderCapability(providerId);
  const aspect = merchantAdAspectRatio();
  const resolution = caps.default_resolution || '720p';

  let tokens = 0;
  let chargeSource = charge.source || 'free_weekly';
  if (chargeSource === 'tokens') {
    tokens = TOKENS_PER_VIDEO;
  }

  let durationSec;
  let durationLabel;
  if (format === AD_FORMATS.UGC) {
    durationSec = estimateUgcDurationSec(providerId);
    durationLabel = '2–5 minutes';
  } else {
    durationSec = 180;
    durationLabel = '3–8 minutes';
  }

  return {
    tokens,
    charge_source: chargeSource,
    tokens_per_video: TOKENS_PER_VIDEO,
    estimated_duration_sec: durationSec,
    estimated_duration_label: durationLabel,
    resolution,
    aspect_ratio: aspect,
    provider_id: providerId,
    format,
    video_generation: {
      label: 'Video Generation',
      tokens_approx: tokens || TOKENS_PER_VIDEO,
      note: chargeSource === 'free_weekly' ? 'Uses free weekly quota' : `≈ ${TOKENS_PER_VIDEO} Tokens`,
    },
  };
}
