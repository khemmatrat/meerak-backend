import { createRenderService } from './renderService.js';
import { createRenderQueue } from './renderQueue.js';
import { createTemplateEngine } from './templateEngine.js';
import { createCaptionEngine } from './captionEngine.js';
import { createMotionEngine } from './motionEngine.js';
import { createThumbnailEngine } from './thumbnailEngine.js';
import { createArtifactManager } from './artifactManager.js';
import { isRenderEnabled } from './config.js';

export { createTemplateEngine } from './templateEngine.js';
export { createCaptionEngine } from './captionEngine.js';
export { createMotionEngine } from './motionEngine.js';
export { createThumbnailEngine } from './thumbnailEngine.js';
export { createArtifactManager } from './artifactManager.js';
export { createRenderQueue } from './renderQueue.js';
export { createRenderService } from './renderService.js';

/**
 * createRenderEngine – main factory wiring all render sub-engines.
 *
 * Returns a disabled stub when AIVOS_RENDER_ENABLED is falsy.
 * Exposes:
 *   - engine.handle(nodeId, context)  → used by pipelineExecutor
 *   - engine.queue                    → RenderQueue instance
 *   - engine.template                 → TemplateEngine instance
 *   - engine.caption                  → CaptionEngine instance
 *   - engine.motion                   → MotionEngine instance
 *   - engine.thumbnail                → ThumbnailEngine instance
 *   - engine.artifacts                → ArtifactManager instance
 */
export function createRenderEngine(deps = {}) {
  if (!isRenderEnabled()) {
    return {
      enabled: false,
      async handle() {
        const err = new Error('render_disabled');
        err.code = 'AIVOS_RENDER_DISABLED';
        throw err;
      },
    };
  }

  const template = createTemplateEngine(deps);
  const caption = createCaptionEngine(deps);
  const motion = createMotionEngine(deps);
  const thumbnail = createThumbnailEngine(deps);
  const artifacts = createArtifactManager(deps);

  const service = createRenderService({
    ...deps,
    templateEngine: template,
    captionEngine: caption,
    motionEngine: motion,
    thumbnailEngine: thumbnail,
    artifactManager: artifacts,
  });

  const queue = createRenderQueue({ renderService: service, bullQueue: deps.bullQueue || null });

  return {
    enabled: true,
    template,
    caption,
    motion,
    thumbnail,
    artifacts,
    queue,

    /**
     * Handle a 'render' pipeline node.
     * @param {string} nodeId
     * @param {{ jobId?: string, payload?: object }} context
     */
    async handle(nodeId, context = {}) {
      if (nodeId !== 'render') return null;
      const res = await service.render(context.jobId || 'render-job', context.payload || {});
      return { artifact: res.artifact, render_id: res.id, engines: res.engines };
    },
  };
}

export default createRenderEngine;
