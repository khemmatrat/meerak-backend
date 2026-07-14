import { isFeedRankingEnabled } from '../config.js';

function score(item) {
  const urgency = Number(item.urgency ?? item.priority ?? 50) / 100;
  const revenue = Number(item.revenue ?? item.metadata?.revenue ?? 0) / 100;
  const mission = item.kind === 'mission' ? 1 : Number(item.mission ?? 0);
  const preference = Number(item.preference ?? item.metadata?.preference ?? 50) / 100;
  const freshness = Number(item.freshness ?? 0.5);
  return (
    urgency * 0.3 +
    revenue * 0.2 +
    mission * 0.2 +
    preference * 0.2 +
    freshness * 0.1
  );
}

export function rankFeed(items = []) {
  if (!isFeedRankingEnabled()) {
    return [...items].sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }
  return [...items]
    .map((item) => ({ ...item, _rankScore: score(item) }))
    .sort((a, b) => b._rankScore - a._rankScore)
    .map(({ _rankScore, ...item }) => ({ ...item, rankScore: _rankScore }));
}

export function createFeedRankingEngine() {
  return { rank: rankFeed, score };
}
