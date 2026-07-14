import { AD_FORMATS } from '../../types.js';
import {
  checkProviderCapabilities,
  resolveUgcBackendProvider,
} from '../capabilities/capabilityLayer.js';
import {
  failGeneration,
  GENERATION_ERRORS,
} from '../../state/generationStateMachine.js';
import { generateUgcViaGrok } from './adapters/grokUgcAdapter.js';

/** @type {Record<string, (ctx: import('../../../types.js').VideoGenerateRequest, caps: object) => Promise<object>>} */
const UGC_ADAPTERS = {
  grok: generateUgcViaGrok,
};

/** @type {import('../../../types.js').VideoProvider} */
export const ugcVideoProvider = {
  id: 'ugc_grok',
  supports(format) {
    return format === AD_FORMATS.UGC;
  },
  async generate(ctx) {
    const backendId = resolveUgcBackendProvider(ctx.plan?.video_provider_id || 'ugc_grok');
    const capability = checkProviderCapabilities(backendId, ctx.format, {
      request: ctx.request,
      plan: ctx.plan,
    });

    if (!capability.ok) {
      failGeneration(ctx.job, GENERATION_ERRORS.CAPABILITY_UNAVAILABLE, 'provider_capability_unavailable', capability);
      const err = new Error('provider_capability_unavailable');
      err.code = GENERATION_ERRORS.CAPABILITY_UNAVAILABLE;
      err.details = capability;
      throw err;
    }

    const adapter = UGC_ADAPTERS[backendId];
    if (!adapter) {
      failGeneration(ctx.job, GENERATION_ERRORS.PROVIDER_FAILED, `no_adapter_for_${backendId}`);
      const err = new Error(`no_adapter_for_${backendId}`);
      err.code = GENERATION_ERRORS.PROVIDER_FAILED;
      throw err;
    }

    return adapter(ctx, capability.capabilities);
  },
};

export { GENERATION_ERRORS as UGC_GENERATION_ERRORS };
