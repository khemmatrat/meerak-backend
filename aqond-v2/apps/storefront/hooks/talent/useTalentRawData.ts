'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import {
  readTalentCacheEntry,
  talentRawCacheKey,
} from '@/lib/talent/cache/talentDataCache';
import {
  loadTalentRawByProfile,
  type TalentRawProfile,
} from '@/lib/talent/cache/talentRawLoaders';
import type { TalentTodayRaw } from '@/lib/talent/talentTodaySources';

/** Shared fetch + cache for Today / Search / Timeline / Commerce raw payloads */
export function useTalentRawData(profile: TalentRawProfile) {
  const { auth, user } = useAuth();
  const userId = user?.id || auth?.userId;
  const cacheKey = userId ? talentRawCacheKey(profile, userId) : null;

  const [raw, setRaw] = useState<TalentTodayRaw | null>(() => {
    if (!cacheKey) return null;
    return readTalentCacheEntry<TalentTodayRaw>(cacheKey)?.data ?? null;
  });
  const [loading, setLoading] = useState(() => {
    if (!auth?.userId || !userId) return false;
    if (cacheKey && readTalentCacheEntry(cacheKey)) return false;
    return true;
  });
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    async (force = false) => {
      if (!auth?.userId || !userId) {
        setRaw(null);
        setError(null);
        setLoading(false);
        return;
      }

      if (!force && cacheKey) {
        const hit = readTalentCacheEntry<TalentTodayRaw>(cacheKey);
        if (hit) {
          setRaw(hit.data);
          setError(null);
          setLoading(false);
          return;
        }
      }

      setLoading(true);
      setError(null);
      try {
        const next = await loadTalentRawByProfile(profile, auth, userId, force);
        setRaw(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'load_failed');
        setRaw(null);
      } finally {
        setLoading(false);
      }
    },
    [auth, userId, profile, cacheKey],
  );

  useEffect(() => {
    void reload(false);
  }, [reload]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && auth?.userId) void reload(false);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [auth?.userId, reload]);

  return {
    raw,
    loading,
    error,
    userId,
    loggedIn: !!auth?.userId,
    reload: () => reload(true),
  };
}
