import { isPublishEnabled } from '../../config.js';
import { publishMerchantAd } from '../../publishBridge.js';

/**
 * Publish Engine — delegates to existing publishBridge (no duplication).
 * @param {{ job: object, target?: string, studioResult?: object }} input
 */
export async function routeToPublish(input) {
  if (!input.job?.director_plan?.auto_publish) {
    return { ok: true, skipped: true, reason: 'auto_publish_disabled' };
  }
  if (!isPublishEnabled()) {
    return { ok: false, error: 'aivos_merchant_ad_publish_disabled' };
  }
  return publishMerchantAd(input.job, {
    target: input.target || 'studio_feed',
    studioResult: input.studioResult,
  });
}
