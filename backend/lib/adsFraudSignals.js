/**
 * Lightweight ads fraud signals (click velocity, self-click patterns).
 */

const CLICK_WINDOW_SEC = 60;
const MAX_CLICKS_PER_WINDOW = 8;
const MAX_CLICKS_SAME_IMPRESSION = 2;

function clickKey(viewerKey, kind) {
  return `ads:fraud:click:${kind}:${viewerKey}`;
}

function viewerKeyFrom({ userId, sessionId, ip }) {
  if (userId) return `u:${userId}`;
  if (sessionId) return `s:${sessionId}`;
  if (ip) return `ip:${ip}`;
  return 'anon';
}

/**
 * @returns {{ allowed: boolean, reason?: string, score?: number }}
 */
export async function assessClickFraud(redis, ctx) {
  if (!redis) return { allowed: true, score: 0 };

  const vk = viewerKeyFrom(ctx);
  const imp = ctx.publicImpressionId || 'x';

  const velKey = clickKey(vk, 'vel');
  const vel = await redis.incr(velKey);
  if (vel === 1) await redis.expire(velKey, CLICK_WINDOW_SEC);
  if (vel > MAX_CLICKS_PER_WINDOW) {
    return { allowed: false, reason: 'click_velocity_exceeded', score: 90 };
  }

  const impKey = clickKey(`${vk}:${imp}`, 'imp');
  const impCount = await redis.incr(impKey);
  if (impCount === 1) await redis.expire(impKey, 3600);
  if (impCount > MAX_CLICKS_SAME_IMPRESSION) {
    return { allowed: false, reason: 'duplicate_impression_click', score: 70 };
  }

  if (ctx.advertiserUserId && ctx.viewerUserId && ctx.advertiserUserId === ctx.viewerUserId) {
    return { allowed: false, reason: 'self_click', score: 100 };
  }

  return { allowed: true, score: Math.min(vel * 5, 40) };
}

const FRAUD_RECENT_KEY = 'ads:fraud:recent';

export async function recordFraudBlock(redis, entry) {
  if (!redis) return;
  const payload = JSON.stringify({ ...entry, at: new Date().toISOString() });
  await redis.lpush(FRAUD_RECENT_KEY, payload);
  await redis.ltrim(FRAUD_RECENT_KEY, 0, 99);
}

export async function listRecentFraudBlocks(redis, limit = 50) {
  if (!redis) return [];
  const raw = await redis.lrange(FRAUD_RECENT_KEY, 0, Math.max(0, limit - 1));
  return raw
    .map((s) => {
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Block outcome billing for users with recent high-score fraud signals.
 */
export async function assessOutcomeBillFraud(redis, { meerakUserId, advertiserUserId }) {
  if (!redis || !meerakUserId) return { allowed: true, score: 0 };

  if (advertiserUserId && String(advertiserUserId) === String(meerakUserId)) {
    return { allowed: false, reason: 'self_attribution_blocked', score: 100 };
  }

  const recent = await listRecentFraudBlocks(redis, 30);
  const hits = recent.filter(
    (b) => b.userId && String(b.userId) === String(meerakUserId) && Number(b.score || 0) >= 70,
  );
  if (hits.length >= 2) {
    return { allowed: false, reason: 'fraud_history_blocked', score: 95 };
  }
  if (hits.length === 1) {
    return { allowed: false, reason: 'fraud_signal_blocked', score: hits[0].score };
  }

  const velKey = clickKey(`u:${meerakUserId}`, 'vel');
  const vel = Number((await redis.get(velKey)) || 0);
  if (vel > MAX_CLICKS_PER_WINDOW) {
    return { allowed: false, reason: 'click_velocity_at_outcome', score: 90 };
  }

  return { allowed: true, score: Math.min(vel * 5, 40) };
}
