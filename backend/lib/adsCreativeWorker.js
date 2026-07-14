/**
 * Background worker — FFmpeg transcode + SSOT metadata update.
 */
import { processCreativeMetadata } from './adsCreativeProcessing.js';
import { transcodeAdVideoCreative } from './adsCreativeTranscode.js';
import { updateAdCreativeMetadata } from './adsBridgeClient.js';

/**
 * @param {{ creativeId?: string; sourceUrl: string; uploadToS3: Function; contentKind?: string }} job
 */
export async function processAdsCreativeTranscodeJob(job) {
  const { creativeId, sourceUrl, uploadToS3, contentKind = 'TALENT_VIDEO' } = job || {};
  if (!sourceUrl || !uploadToS3) {
    return { ok: false, reason: 'missing_job_params' };
  }

  const transcodeResult = await transcodeAdVideoCreative(sourceUrl, {
    uploadToS3,
    originalName: 'creative-reprocess.mp4',
  });

  if (transcodeResult.skipped) {
    return { ok: false, reason: transcodeResult.reason || 'transcode_skipped' };
  }

  const enriched = await processCreativeMetadata({
    contentKind,
    playbackUrl: transcodeResult.playbackUrl,
    posterUrl: transcodeResult.posterUrl,
    thumbnailUrl: transcodeResult.posterUrl,
    imageUrl: transcodeResult.posterUrl,
    processingStatus: 'READY',
  });

  let ssotUpdated = false;
  if (creativeId) {
    try {
      await updateAdCreativeMetadata(creativeId, enriched);
      ssotUpdated = true;
    } catch (e) {
      console.warn('[adsCreativeWorker] SSOT update failed:', e?.message || e);
    }
  }

  return {
    ok: true,
    enriched,
    ssotUpdated,
    playbackUrl: transcodeResult.playbackUrl,
    posterUrl: transcodeResult.posterUrl,
  };
}
