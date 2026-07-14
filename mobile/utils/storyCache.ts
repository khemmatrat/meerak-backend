import type { UserStory } from "../services/storyService";

const KEY_PREFIX = "aqond_story_cache_";
const TTL_MS = 5 * 60 * 1000;

export function cacheUserStories(userId: string, stories: UserStory[]): void {
  if (typeof sessionStorage === "undefined" || !userId || !stories.length)
    return;
  try {
    sessionStorage.setItem(
      KEY_PREFIX + userId,
      JSON.stringify({ at: Date.now(), stories }),
    );
  } catch {
    /* ignore */
  }
}

export function readCachedUserStories(userId: string): UserStory[] | null {
  if (typeof sessionStorage === "undefined" || !userId) return null;
  try {
    const raw = sessionStorage.getItem(KEY_PREFIX + userId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: number; stories?: UserStory[] };
    if (!parsed?.stories?.length) return null;
    if (Date.now() - (parsed.at || 0) > TTL_MS) return null;
    return parsed.stories;
  } catch {
    return null;
  }
}
