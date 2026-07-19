/** In-memory Talent read cache — dedupe in-flight + TTL reuse (presentation layer only) */

export type TalentCacheEntry<T> = {
  data: T;
  fetchedAt: number;
};

const entries = new Map<string, TalentCacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export const TALENT_DATA_CACHE_TTL_MS = 30_000;

export function talentRawCacheKey(profile: string, userId: string, suffix?: string): string {
  return suffix ? `talent:${profile}:${userId}:${suffix}` : `talent:${profile}:${userId}`;
}

export function readTalentCacheEntry<T>(key: string, ttlMs = TALENT_DATA_CACHE_TTL_MS): TalentCacheEntry<T> | null {
  const hit = entries.get(key) as TalentCacheEntry<T> | undefined;
  if (!hit) return null;
  if (Date.now() - hit.fetchedAt > ttlMs) return null;
  return hit;
}

export function primeTalentCache<T>(key: string, data: T): void {
  entries.set(key, { data, fetchedAt: Date.now() });
}

export async function getCachedTalentData<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: { ttlMs?: number; force?: boolean },
): Promise<T> {
  const ttlMs = options?.ttlMs ?? TALENT_DATA_CACHE_TTL_MS;
  if (!options?.force) {
    const fresh = readTalentCacheEntry<T>(key, ttlMs);
    if (fresh) return fresh.data;
    const pending = inflight.get(key) as Promise<T> | undefined;
    if (pending) return pending;
  } else {
    inflight.delete(key);
  }

  const promise = fetcher()
    .then((data) => {
      primeTalentCache(key, data);
      inflight.delete(key);
      return data;
    })
    .catch((err) => {
      inflight.delete(key);
      throw err;
    });

  inflight.set(key, promise);
  return promise;
}

export function invalidateTalentCacheForUser(userId: string): void {
  for (const key of entries.keys()) {
    if (key.includes(`:${userId}`)) entries.delete(key);
  }
  for (const key of inflight.keys()) {
    if (key.includes(`:${userId}`)) inflight.delete(key);
  }
}

export function clearTalentDataCache(): void {
  entries.clear();
  inflight.clear();
}
