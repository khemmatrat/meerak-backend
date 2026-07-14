import { resolveVideoProvider } from '../providers/video/registry.js';

/**
 * Video Engine — provider-agnostic facade.
 * Director calls generateVideo(); providers contain Grok/TVC-specific logic.
 *
 * @param {import('../types.js').VideoGenerateRequest} request
 * @returns {Promise<import('../types.js').VideoGenerateResult>}
 */
export async function generateVideo(request) {
  const provider = resolveVideoProvider(request.format);
  if (!provider) {
    const err = new Error('video_provider_not_found');
    err.code = 'DIRECTOR_NO_VIDEO_PROVIDER';
    err.format = request.format;
    throw err;
  }

  const result = await provider.generate(request);
  return {
    job: result.job,
    provider_id: result.provider_id || provider.id,
  };
}

export { registerVideoProvider, listVideoProviders } from '../providers/video/registry.js';
