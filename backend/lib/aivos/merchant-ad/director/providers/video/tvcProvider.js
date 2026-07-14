import { runMerchantAdPipeline } from '../../../videoEngine.js';
import { AD_FORMATS } from '../../types.js';

/** @type {import('../types.js').VideoProvider} */
export const tvcVideoProvider = {
  id: 'tvc_pipeline',
  supports(format) {
    return format === AD_FORMATS.TVC;
  },
  async generate(ctx) {
    const job = await runMerchantAdPipeline(ctx.job, ctx.outDir);
    return { job, provider_id: this.id };
  },
};
