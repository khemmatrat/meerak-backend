import path from 'path';
import { saveJob } from '../../../../merchantAdStorage.js';
import { publicFilePath } from '../../../../merchantAdStorage.js';
import {
  generateUgcClip,
  resolveReferenceImagePath,
} from '../../../../ugcVideoBridge.js';
import {
  applyGenerationState,
  failGeneration,
  GENERATION_ERRORS,
  GENERATION_STATES,
} from '../../../state/generationStateMachine.js';
import { merchantAdAspectRatio } from '../../../../config.js';

/**
 * Grok UGC adapter — called only through ugcProvider + capability layer.
 * @param {import('../../types.js').VideoGenerateRequest} ctx
 * @param {object} caps
 */
export async function generateUgcViaGrok(ctx, caps) {
  const { job, outDir, plan, request } = ctx;
  applyGenerationState(job, GENERATION_STATES.GENERATING, { stage: 'ugc_prepare' });
  await saveJob(job);

  const imagePath = await resolveReferenceImagePath({ request, outDir });
  if (!imagePath) {
    failGeneration(job, GENERATION_ERRORS.VALIDATION_FAILED, 'reference_image_unresolved');
    const err = new Error('reference_image_unresolved');
    err.code = GENERATION_ERRORS.VALIDATION_FAILED;
    throw err;
  }

  const prompt = plan.prompt?.video || plan.prompt?.spoken_text_slot || request.product_title;
  const outPath = path.join(outDir, 'output.mp4');
  const durationSec = caps.default_duration_sec || 10;

  const clipPath = await generateUgcClip({
    prompt,
    imagePath,
    durationSec,
    outPath,
    aspect: merchantAdAspectRatio(),
    onProgress: async (stage) => {
      applyGenerationState(job, GENERATION_STATES.GENERATING, { stage });
      await saveJob(job);
    },
  });

  if (!clipPath) {
    failGeneration(job, GENERATION_ERRORS.PROVIDER_FAILED, 'ugc_provider_failed', {
      provider: 'grok',
    });
    const err = new Error('ugc_provider_failed');
    err.code = GENERATION_ERRORS.PROVIDER_FAILED;
    throw err;
  }

  applyGenerationState(job, GENERATION_STATES.UPLOADING, { stage: 'ugc_normalize' });
  job.output_video_url = publicFilePath(job.id, 'output.mp4');
  job.output_poster_url = job.output_poster_url || request.portrait_image_url || request.product_image_url;
  job.video_engine = process.env.AIVOS_MERCHANT_AD_MOCK_UGC === '1' ? 'mock_ugc_lipsync' : 'grok_ugc_lipsync';
  job.clip_duration_sec = durationSec;
  applyGenerationState(job, GENERATION_STATES.COMPLETED);
  await saveJob(job);

  return { job, provider_id: 'ugc_grok', adapter: 'grok' };
}
