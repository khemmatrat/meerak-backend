const DAY = 86400000;

export const RETENTION_POLICIES = Object.freeze({
  missionHistory: { dataClass: 'missionHistory', ttlMs: 365 * DAY, table: 'growth_missions' },
  feedCache: { dataClass: 'feedCache', ttlMs: 7 * DAY, table: 'growth_feed_items' },
  notifications: { dataClass: 'notifications', ttlMs: 90 * DAY, table: 'growth_notifications' },
  loopState: { dataClass: 'loopState', ttlMs: 30 * DAY, table: 'growth_loop_state' },
  churnScore: { dataClass: 'churnScore', ttlMs: 180 * DAY, table: 'growth_churn_scores' },
});

export function isExpired(isoOrMs, ttlMs, now = Date.now()) {
  if (!isoOrMs) return false;
  const ts = typeof isoOrMs === 'number' ? isoOrMs : Date.parse(isoOrMs);
  if (Number.isNaN(ts)) return false;
  return now - ts > ttlMs;
}
