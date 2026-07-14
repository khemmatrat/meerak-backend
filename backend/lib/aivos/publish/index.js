import { createPublishService } from './publishService.js';
import { createPublishQueue } from './publishQueue.js';
import { createPublishHistory } from './publishHistory.js';
import { createDraftManager } from './draftManager.js';
import { createScheduler } from './scheduler.js';
import { createWebhookHandler } from './webhookHandler.js';
import { isPublishEnabled } from './config.js';

export { createPublishService } from './publishService.js';
export { createPublishQueue } from './publishQueue.js';
export { createPublishHistory } from './publishHistory.js';
export { createDraftManager } from './draftManager.js';
export { createScheduler } from './scheduler.js';
export { createWebhookHandler } from './webhookHandler.js';
export { createTikTokAdapter } from './platforms/tiktok.js';
export { createFacebookAdapter } from './platforms/facebook.js';
export { createYouTubeAdapter } from './platforms/youtube.js';
export { createInstagramAdapter } from './platforms/instagram.js';

/**
 * createPublishEngine – main factory wiring all publish sub-components.
 *
 * Returns a disabled stub when AIVOS_PUBLISH_ENABLED is falsy.
 * Exposes:
 *   - engine.handle(nodeId, context)   → used by pipelineExecutor (publish node)
 *   - engine.service                   → PublishService
 *   - engine.queue                     → PublishQueue
 *   - engine.history                   → PublishHistory
 *   - engine.drafts                    → DraftManager
 *   - engine.scheduler                 → Scheduler
 *   - engine.webhook                   → WebhookHandler
 */
export function createPublishEngine(deps = {}) {
  if (!isPublishEnabled()) {
    return {
      enabled: false,
      async handle() {
        const err = new Error('publish_disabled');
        err.code = 'AIVOS_PUBLISH_DISABLED';
        throw err;
      },
    };
  }

  const history = createPublishHistory(deps);
  const webhookHandler = createWebhookHandler({ ...deps, history });

  const service = createPublishService({ ...deps, history });
  const queue = createPublishQueue({ renderService: null, publishService: service, bullQueue: deps.bullQueue || null });
  const drafts = createDraftManager(deps);
  const scheduler = createScheduler({ ...deps, publishService: service });

  return {
    enabled: true,
    service,
    queue,
    history,
    drafts,
    scheduler,
    webhook: webhookHandler,

    /**
     * Handle the 'publish' pipeline node.
     * Reuses the artifact from the render checkpoint stored in context.
     *
     * @param {string} nodeId
     * @param {{ jobId?: string, payload?: object }} context
     */
    async handle(nodeId, context = {}) {
      if (nodeId !== 'publish') return null;

      const payload = context.payload || {};
      const artifact = payload.artifact || context.artifact || { uri: 'stub://no-render-artifact', stub: true };
      const platforms = payload.platforms || ['tiktok'];
      const options = payload.options || {};

      const res = await service.publish(context.jobId || 'publish-job', artifact, platforms, options);
      return {
        published_url: res.results?.[0]?.published_url || null,
        publish_id: res.publishId,
        platforms: res.results,
        artifact,
      };
    },
  };
}

export default createPublishEngine;
