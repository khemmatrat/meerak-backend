import { FEED_KINDS } from '../config.js';

export function rankFeedItems(items = []) {
  return [...items].sort((a, b) => {
    const pa = Number(a.priority) || 0;
    const pb = Number(b.priority) || 0;
    if (pb !== pa) return pb - pa;
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
}

export function isWorkFeedKind(kind) {
  return FEED_KINDS.includes(kind);
}

export function createFeedRanker() {
  return { rank: rankFeedItems, isWorkFeedKind };
}
