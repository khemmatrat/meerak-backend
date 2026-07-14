/**
 * Ad render telemetry — fail counters, viewability billing events.
 */

const FAIL_THRESHOLD = 5;
const FAIL_WINDOW_SEC = 3600;

/** Only viewability thresholds are billable (not reserve / rendered / playing alone). */
const BILLABLE_EVENTS = new Set(['ad_viewable_1s', 'ad_video_view_2s']);
const NON_BILLABLE_FAIL_EVENTS = new Set([
  'ad_media_failed',
  'ad_media_failed_timeout',
]);

function failKey(creativeId) {
  return `ads:render_fail:${creativeId}`;
}

/**
 * @param {import('ioredis').Redis | null} redis
 */
export async function trackRenderFail(redis, creativeId) {
  if (!redis || !creativeId) return { count: 0, shouldPause: false };
  const key = failKey(creativeId);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, FAIL_WINDOW_SEC);
  }
  return { count, shouldPause: count >= FAIL_THRESHOLD };
}

export function isBillableRenderEvent(eventType) {
  return BILLABLE_EVENTS.has(eventType);
}

export function isFailedRenderEvent(eventType) {
  return NON_BILLABLE_FAIL_EVENTS.has(eventType);
}

export const RENDER_EVENT_TYPES = new Set([
  'ad_rendered',
  'ad_media_loaded',
  'ad_media_playing',
  'ad_viewable_1s',
  'ad_video_view_2s',
  'ad_media_failed',
  'ad_media_failed_timeout',
  'ad_cta_clicked',
]);