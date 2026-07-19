'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import {
  filterTalentNotificationsByFilter,
  groupTalentNotifications,
  type TalentNotificationFilterId,
} from '@/lib/talent/talentNotificationPresentation';
import { fetchTalentNotifications } from '@/lib/talent/talentTodaySources';
import type { TalentNotificationRow } from '@/lib/talent/talentTodaySources';

const NOTIFICATION_CENTER_LIMIT = 50;

export function useTalentNotifications(activeFilter: TalentNotificationFilterId) {
  const { auth } = useAuth();
  const [items, setItems] = useState<TalentNotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!auth?.userId) {
      setItems([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchTalentNotifications(auth, NOTIFICATION_CENTER_LIMIT);
      setItems(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'notifications_unavailable');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [auth]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && auth?.userId) void reload();
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
    reload,
  };
}
