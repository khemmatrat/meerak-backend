/**
 * Redis-backed near-real-time campaign counters (30s poll).
 */

const TTL_SEC = 120;

function key(campaignId, metric) {
  return `ads:rt:${campaignId}:${metric}`;
}

export async function bumpRealtimeCounter(redis, campaignId, metric, delta = 1) {
  if (!redis || !campaignId) return;
  const k = key(campaignId, metric);
  await redis.incrBy(k, delta);
  await redis.expire(k, TTL_SEC);
}

export async function getRealtimeCounters(redis, campaignId) {
  if (!redis || !campaignId) {
    return { impressions: 0, clicks: 0, outcomes: 0, windowSec: TTL_SEC, stale: true };
  }
  const [impressions, clicks, outcomes] = await Promise.all([
    redis.get(key(campaignId, 'impressions')),
    redis.get(key(campaignId, 'clicks')),
    redis.get(key(campaignId, 'outcomes')),
  ]);
  return {
    impressions: Number(impressions || 0),
    clicks: Number(clicks || 0),
    outcomes: Number(outcomes || 0),
    windowSec: TTL_SEC,
    stale: false,
    polledAt: new Date().toISOString(),
  };
}
