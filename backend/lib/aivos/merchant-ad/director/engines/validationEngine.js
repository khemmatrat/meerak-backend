import {
  isVideoGenEnabled,
  merchantAdAspectRatio,
} from '../../config.js';
import { getTokenBalance } from '../../tokenEngine.js';
import { TOKENS_PER_VIDEO } from '../../tokenConfig.js';
import { AD_FORMATS } from '../types.js';
import { getProviderCapability } from '../providers/capabilities/capabilityLayer.js';
import { checkProviderCapabilities, resolveUgcBackendProvider } from '../providers/capabilities/capabilityLayer.js';

const SUPPORTED_ASPECT_RATIOS = ['9:16', '16:9', '1:1'];

function hasImageRef(request) {
  const product = String(request.product_image_url || '').trim();
  const portrait = String(request.portrait_image_url || '').trim();
  return Boolean(product || portrait);
}

function hasPortraitRef(request) {
  return Boolean(String(request.portrait_image_url || '').trim());
}

/**
 * @param {import('../types.js').DirectorRequest} request
 * @param {import('../types.js').DirectorPlan} plan
 * @param {object} [options]
 * @param {object} [options.quota]
 * @param {object} [options.charge]
 * @param {boolean} [options.skip_token_check]
 */
export async function validateDirectorRequest(request, plan, options = {}) {
  const checks = [];
  const format = plan.format;
  const providerId = resolveUgcBackendProvider(plan.video_provider_id || 'ugc_grok');
  const caps = getProviderCapability(providerId);
  const language = plan.prompt?.dimensions?.language || request.guide?.language || 'th';
  const aspect = merchantAdAspectRatio();
  const scriptText = plan.script?.full_text_th || '';
  const promptText = plan.prompt?.video || '';

  checks.push({
    id: 'product_title',
    label: 'Product title',
    passed: Boolean(String(request.product_title || '').trim()),
    message: 'product_title is required',
  });

  checks.push({
    id: 'merchant_id',
    label: 'Merchant metadata',
    passed: Boolean(String(request.merchant_id || '').trim()),
    message: 'merchant_id is required',
  });

  checks.push({
    id: 'product_image',
    label: 'Product image exists',
    passed: hasImageRef(request),
    message: 'product_image_url or portrait_image_url required',
  });

  const portraitRequired = format === AD_FORMATS.UGC && caps.requires_portrait !== false;
  checks.push({
    id: 'portrait_image',
    label: 'Portrait / reference image',
    passed: !portraitRequired || hasPortraitRef(request) || hasImageRef(request),
    message: portraitRequired ? 'portrait_image_url required for UGC lip sync' : 'optional',
  });

  checks.push({
    id: 'script_length',
    label: 'Script length within limit',
    passed: scriptText.length <= (caps.script_max_chars || 500),
    message: `${scriptText.length}/${caps.script_max_chars || 500} chars`,
  });

  checks.push({
    id: 'prompt_size',
    label: 'Prompt size within limit',
    passed: !promptText || promptText.length <= (caps.prompt_max_chars || 8000),
    message: `${promptText.length}/${caps.prompt_max_chars || 8000} chars`,
  });

  if (!options.skip_token_check) {
    const quota = options.quota;
    const charge = options.charge;
    let tokenOk = true;
    let tokenMessage = 'ok';
    if (quota?.remaining <= 0) {
      if (charge?.source === 'tokens') {
        const balance = await getTokenBalance(request.merchant_id);
        tokenOk = balance >= TOKENS_PER_VIDEO;
        tokenMessage = `balance ${balance}, need ${TOKENS_PER_VIDEO}`;
      } else if (!charge) {
        tokenOk = false;
        tokenMessage = 'insufficient quota and no charge plan';
      }
    }
    checks.push({
      id: 'token_balance',
      label: 'Token balance sufficient',
      passed: tokenOk,
      message: tokenMessage,
    });
  }

  checks.push({
    id: 'aspect_ratio',
    label: 'Supported aspect ratio',
    passed: SUPPORTED_ASPECT_RATIOS.includes(aspect),
    message: aspect,
  });

  checks.push({
    id: 'language',
    label: 'Supported language',
    passed: (caps.languages || ['th', 'en']).includes(language),
    message: language,
  });

  checks.push({
    id: 'video_gen_enabled',
    label: 'Video generation enabled',
    passed: isVideoGenEnabled() || process.env.AIVOS_MERCHANT_AD_MOCK_UGC === '1',
    message: isVideoGenEnabled() ? 'enabled' : 'AIVOS_MERCHANT_AD_VIDEO_GEN required',
  });

  if (format === AD_FORMATS.UGC) {
    const capability = checkProviderCapabilities(providerId, format, {
      request,
      plan,
      aspect_ratio: aspect,
      language,
    });
    for (const capCheck of capability.checks) {
      checks.push({
        id: `capability_${capCheck.id}`,
        label: capCheck.label,
        passed: capCheck.passed,
        message: capCheck.message,
      });
    }
  }

  const failed = checks.filter((c) => !c.passed);
  return {
    ok: failed.length === 0,
    checks,
    errors: failed.map((c) => ({ id: c.id, message: c.message })),
    format,
    provider_id: providerId,
  };
}

export function assertValidationPassed(validation) {
  if (validation.ok) return;
  const err = new Error('validation_failed');
  err.code = 'validation_failed';
  err.details = validation;
  throw err;
}
