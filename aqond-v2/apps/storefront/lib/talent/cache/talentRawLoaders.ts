import type { AuthState } from '@/lib/bff';
import { loadTalentCommerceRaw } from '@/lib/talent/commerce/talentCommerceSources';
import {
  getCachedTalentData,
  primeTalentCache,
  talentRawCacheKey,
  TALENT_DATA_CACHE_TTL_MS,
} from '@/lib/talent/cache/talentDataCache';
import { fetchTalentNotifications } from '@/lib/talent/notifications/talentNotificationsAdapter';
import type { TalentNotificationRow } from '@/lib/talent/notifications/talentNotificationsTypes';
import type { TalentChatRaw } from '@/lib/talent/talentChatCompose';
import { loadTalentChatRaw } from '@/lib/talent/talentChatSources';
import { loadTalentSearchRaw } from '@/lib/talent/talentSearchSources';
import type { TalentTodayRaw } from '@/lib/talent/talentTodaySources';
import { loadTalentTodayRaw } from '@/lib/talent/talentTodaySources';

export type TalentRawProfile = 'today' | 'search' | 'commerce';

function primeNotificationsFromRaw(userId: string, rows: TalentNotificationRow[], limit: number) {
  if (rows.length > 0) {
    primeTalentCache(talentRawCacheKey('notifications', userId, String(limit)), rows);
  }
}

export async function loadTalentTodayCached(
  auth: AuthState,
  userId: string,
  force = false,
): Promise<TalentTodayRaw> {
  const key = talentRawCacheKey('today', userId);
  const data = await getCachedTalentData(key, () => loadTalentTodayRaw(auth, userId), { force });
  primeNotificationsFromRaw(userId, data.notifications, 8);
  return data;
}

export async function loadTalentSearchCached(
  auth: AuthState,
  userId: string,
  force = false,
): Promise<TalentTodayRaw> {
  const key = talentRawCacheKey('search', userId);
  const data = await getCachedTalentData(key, () => loadTalentSearchRaw(auth, userId), { force });
  primeNotificationsFromRaw(userId, data.notifications, 50);
  return data;
}

export async function loadTalentCommerceCached(
  auth: AuthState,
  userId: string,
  force = false,
): Promise<TalentTodayRaw> {
  const key = talentRawCacheKey('commerce', userId);
  return getCachedTalentData(key, () => loadTalentCommerceRaw(auth, userId), { force });
}

export async function loadTalentChatCached(
  auth: AuthState,
  userId: string,
  force = false,
): Promise<TalentChatRaw> {
  const key = talentRawCacheKey('chat', userId);
  return getCachedTalentData(key, () => loadTalentChatRaw(auth, userId), { force });
}

export async function loadTalentNotificationsCached(
  auth: AuthState,
  limit: number,
  force = false,
): Promise<TalentNotificationRow[]> {
  const key = talentRawCacheKey('notifications', auth.userId, String(limit));
  return getCachedTalentData(key, () => fetchTalentNotifications(auth, limit), { force });
}

export async function loadTalentRawByProfile(
  profile: TalentRawProfile,
  auth: AuthState,
  userId: string,
  force = false,
): Promise<TalentTodayRaw> {
  if (profile === 'today') return loadTalentTodayCached(auth, userId, force);
  if (profile === 'commerce') return loadTalentCommerceCached(auth, userId, force);
  return loadTalentSearchCached(auth, userId, force);
}

export { TALENT_DATA_CACHE_TTL_MS };
