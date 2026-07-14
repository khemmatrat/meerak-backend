import { randomUUID } from 'crypto';
import { createFfmpegAdapter } from './ffmpegAdapter.js';
import { assertRenderEnabled } from './config.js';
import { createArtifactManager } from './artifactManager.js';
import { createTemplateEngine } from './templateEngine.js';
import { createCaptionEngine } from './captionEngine.js';
import { createMotionEngine } from './motionEngine.js';
import { createThumbnailEngine } from './thumbnailEngine.js';

/**
 * Render Service – orchestrates all sub-engines into a single render() call.
 *
 * Sub-engines can be injected via deps for testing or overridden in production.
 * All engines degrade gracefully when their optional deps are absent.
 */
export function createRenderService(deps = {}) {
  assertRenderEnabled();

  const adapter = deps.adapter || createFfmpegAdapter();
  const artifactManager = deps.artifactManager || createArtifactManager(deps);
  const templateEngine = deps.templateEngine || createTemplateEngine(deps);
  const captionEngine = deps.captionEngine || createCaptionEngine(deps);
  const motionEngine = deps.motionEngine || createMotionEngine(deps);
  const thumbnailEngine = deps.thumbnailEngine || createThumbnailEngine(deps);

  /**
   * Execute a render job end-to-end.
   *
   * @param {string} jobId
   * @param {{ input?, template?, captions?, motion?, intro?, outro?, thumbnail?, watermark? }} payload
   * @returns {Promise<{ id, jobId, artifact, engines, created_at }>}
   */
  async function render(jobId, payload = {}) {
    const renderJobId = randomUUID();

    // 1. Template resolution
    const templateId = payload.template || 'default';
    const tplCtx = templateEngine.apply(templateId, payload);

    // 2. Caption processing (if segments provided)
    let captionResult = null;
    if (Array.isArray(payload.captions) && payload.captions.length > 0) {
      captionResult = captionEngine.generate(payload.captions);
    } else if (payload.captions && typeof payload.captions === 'object' && payload.captions.srtPath) {
      captionResult = payload.captions;
    }

    // 3. Motion effect resolution
    const motionResult = payload.motion
      ? motionEngine.apply(typeof payload.motion === 'string' ? payload.motion : payload.motion.effect, payload.motion)
      : null;

    // 4. Execute via ffmpeg adapter (passes resolved template, captions, motion)
    const rawArtifact = adapter.render({
      input: payload.input || payload.tempPath,
      template: tplCtx.template,
      captions: captionResult?.srtPath || payload.captions,
      motion: motionResult,
      intro: payload.intro,
      outro: payload.outro,
      thumbnail: payload.thumbnail,
    });

    // 5. AI thumbnail (replaces stub thumb from adapter when kernel is available)
    const thumbResult = await thumbnailEngine.generate(rawArtifact.uri, {
      watermark: payload.watermark,
    });

    // 6. Hash and store final artifacts via artifact manager
    const videoMeta = await artifactManager.store(
      `render/${jobId}/video`,
      rawArtifact.uri,
      { ext: 'mp4', contentType: 'video/mp4', version: '1.0.0' },
    );

    const thumbMeta = await artifactManager.store(
      `render/${jobId}/thumbnail`,
      thumbResult.path,
      { ext: 'jpg', contentType: 'image/jpeg', version: '1.0.0' },
    );

    const artifact = {
      uri: rawArtifact.uri,
      thumbnail: thumbResult.uri,
      hash: videoMeta.hash,
      version: videoMeta.version,
      template: tplCtx.template?.id || templateId,
      captions: !!captionResult,
      motion: motionResult?.effect || null,
      intro: !!payload.intro,
      outro: !!payload.outro,
    };

    return {
      id: renderJobId,
      jobId,
      artifact,
      engines: {
        template: tplCtx.template?.id,
        captions: captionResult ? { count: captionResult.count, srtPath: captionResult.srtPath } : null,
        motion: motionResult ? { effect: motionResult.effect } : null,
        thumbnail: { score: thumbResult.score, ai_generated: thumbResult.ai_generated },
        artifact: { hash: videoMeta.hash, version: videoMeta.version, uploaded: videoMeta.uploaded },
      },
      created_at: new Date().toISOString(),
    };
  }

  return { render };
}

export default createRenderService;
