'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import {
  readTalentCacheEntry,
  talentRawCacheKey,
} from '@/lib/talent/cache/talentDataCache';
import { loadTalentNotificationsCached } from '@/lib/talent/cache/talentRawLoaders';
import {
  filterTalentNotificationsByFilter,
  groupTalentNotifications,
  type TalentNotificationFilterId,
} from '@/lib/talent/talentNotificationPresentation';
import type { TalentNotificationRow } from '@/lib/talent/talentTodaySources';

const NOTIFICATION_CENTER_LIMIT = 50;

export function useTalentNotifications(activeFilter: TalentNotificationFilterId) {
  const { auth } = useAuth();
  const cacheKey = auth?.userId
    ? talentRawCacheKey('notifications', auth.userId, String(NOTIFICATION_CENTER_LIMIT))
    : null;

  const [items, setItems] = useState<TalentNotificationRow[]>(() => {
    if (!cacheKey) return [];
    return readTalentCacheEntry<TalentNotificationRow[]>(cacheKey)?.data ?? [];
  });
  const [loading, setLoading] = useState(() => {
    if (!auth?.userId) return false;
    if (cacheKey && readTalentCacheEntry(cacheKey)) return false;
    return true;
  });
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    async (force = false) => {
      if (!auth?.userId) {
        setItems([]);
        setError(null);
        setLoading(false);
        return;
      }

      if (!force && cacheKey) {
        const hit = readTalentCacheEntry<TalentNotificationRow[]>(cacheKey);
        if (hit) {
          setItems(hit.data);
          setError(null);
          setLoading(false);
          return;
        }
      }

      setLoading(true);
      setError(null);
      try {
        const rows = await loadTalentNotificationsCached(auth, NOTIFICATION_CENTER_LIMIT, force);
        setItems(rows);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'notifications_unavailable');
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [auth, cacheKey],
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

  const filtered = useMemo(
    () => filterTalentNotificationsByFilter(items, activeFilter),
    [items, activeFilter],
  );

  const grouped = useMemo(() => groupTalentNotifications(filtered), [filtered]);

  return {
    loading,
    error,
    items,
    filtered,
    grouped,
    loggedIn: !!auth?.userId,
    reload: () => reload(true),
  };
}
