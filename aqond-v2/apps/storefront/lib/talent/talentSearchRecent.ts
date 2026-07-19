import { TALENT_SEARCH_RECENT_KEY, TALENT_SEARCH_RECENT_MAX } from '@/lib/talent/talentSearchTypes';

/** UI-only recent queries — localStorage, not business state */
export function readTalentSearchRecent(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(TALENT_SEARCH_RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => typeof x === 'string' && x.trim()).slice(0, TALENT_SEARCH_RECENT_MAX);
  } catch {
    return [];
  }
}

export function persistTalentSearchRecent(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed || typeof window === 'undefined') return readTalentSearchRecent();
  const prev = readTalentSearchRecent().filter((q) => q.toLowerCase() !== trimmed.toLowerCase());
  const next = [trimmed, ...prev].slice(0, TALENT_SEARCH_RECENT_MAX);
  try {
    localStorage.setItem(TALENT_SEARCH_RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function clearTalentSearchRecent(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(TALENT_SEARCH_RECENT_KEY);
  } catch {
    /* ignore */
  }
}
