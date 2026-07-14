import { randomUUID } from 'crypto';
import { assertPublishEnabled } from './config.js';
import { createTikTokAdapter } from './platforms/tiktok.js';
import { createFacebookAdapter } from './platforms/facebook.js';
import { createYouTubeAdapter } from './platforms/youtube.js';
import { createInstagramAdapter } from './platforms/instagram.js';

/**
 * Publish Service – main orchestrator for multi-platform publishing.
 *
 * - Resolves platform adapters
 * - Reuses render artifact (uri, hash, template metadata)
 * - Emits analytics events via Runtime events bus
 * - Records to publish history
 */
export function createPublishService(deps = {}) {
  assertPublishEnabled();

  const events = deps.events || null;
  const history = deps.history || null;

  const platformAdapters = {
    tiktok: deps.tiktokAdapter || createTikTokAdapter(deps),
    facebook: deps.facebookAdapter || createFacebookAdapter(deps),
    youtube: deps.youtubeAdapter || createYouTubeAdapter(deps),
    instagram: deps.instagramAdapter || createInstagramAdapter(deps),
    ...(deps.extraAdapters || {}),
  };

  /**
   * Publish an artifact to one or more platforms.
   *
   * @param {string}   jobId      Runtime job ID (for correlation)
   * @param {object}   artifact   Render artifact { uri, hash, template, thumbnail, ... }
   * @param {string[]} platforms  e.g. ['tiktok', 'youtube']
   * @param {object}   options    Per-publish options (title, caption, privacy, …)
   * @returns {Promise<{ publishId, jobId, results: PublishResult[], published_at }>}
   */
  async function publish(jobId, artifact, platforms = [], options = {}) {
    const publishId = randomUUID();
    const results = [];

    for (const platformId of platforms) {
      const adapter = platformAdapters[platformId];
      if (!adapter) {
        const err = new Error(`publish_platform_not_found:${platformId}`);
        err.code = 'PUBLISH_PLATFORM_NOT_FOUND';
        throw err;
      }

      let result;
      try {
        result = await adapter.publish(artifact, {
          ...options,
          ...(options[platformId] || {}),
        });
      } catch (e) {
        result = {
          platform: platformId,
          status: 'failed',
          error: e.message,
          published_at: new Date().toISOString(),
        };
      }

      results.push(result);

      if (history) {
        history.append({
          jobId,
          platform: result.platform || platformId,
          published_id: result.published_id || null,
          published_url: result.published_url || null,
          status: result.status || 'failed',
          artifact,
          renderMetadata: artifact?.template ? { template: artifact.template, hash: artifact.hash } : null,
          error: result.error || null,
        });
      }
    }

    // Emit analytics event via Runtime events bus
    if (events) {
      try {
        await events.emit({
          name: 'aivos.publish.completed',
          correlationId: jobId,
          source: { agentId: 'publish', publishId },
          payload: {
            publishId,
            jobId,
            platforms,
            success: results.filter((r) => r.status === 'published').map((r) => r.platform),
            failed: results.filter((r) => r.status === 'failed').map((r) => r.platform),
            artifact: { uri: artifact?.uri, hash: artifact?.hash },
          },
        });
      } catch { /* non-fatal */ }
    }

    return { publishId, jobId, results, published_at: new Date().toISOString() };
  }

  /** Resolve a single platform adapter. */
  function getAdapter(platformId) {
    return platformAdapters[platformId] || null;
  }

  /** List registered platform ids. */
  function listPlatforms() {
    return Object.keys(platformAdapters);
  }

  return { publish, getAdapter, listPlatforms };
}

export default createPublishService;
