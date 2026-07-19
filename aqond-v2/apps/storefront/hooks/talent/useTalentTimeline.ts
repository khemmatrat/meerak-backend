'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import {
  composeTalentTimelineEvents,
  filterTalentTimelineByPeriod,
  groupTalentTimelineByDay,
  sortTalentTimelineNewestFirst,
} from '@/lib/talent/talentTimelineCompose';
import { loadTalentTimelineRaw } from '@/lib/talent/talentTimelineSources';
import type { TalentTimelinePeriodId } from '@/lib/talent/talentTimelineTypes';
import type { TalentTodayRaw } from '@/lib/talent/talentTodaySources';

export function useTalentTimeline() {
  const { auth, user } = useAuth();
  const userId = user?.id || auth?.userId;
  const [raw, setRaw] = useState<TalentTodayRaw | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<TalentTimelinePeriodId>('week');

  const reload = useCallback(async () => {
    if (!auth?.userId || !userId) {
      setRaw(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await loadTalentTimelineRaw(auth, userId);
      setRaw(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'timeline_unavailable');
      setRaw(null);
    } finally {
      setLoading(false);
    }
  }, [auth, userId]);

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

  const allEvents = useMemo(
    () => (raw ? sortTalentTimelineNewestFirst(composeTalentTimelineEvents(raw)) : []),
    [raw],
  );

  const filtered = useMemo(
    () => filterTalentTimelineByPeriod(allEvents, period),
    [allEvents, period],
  );

  const grouped = useMemo(() => groupTalentTimelineByDay(filtered), [filtered]);

  return {
    loading,
    error,
    period,
    setPeriod,
    events: filtered,
    grouped,
    totalAll: allEvents.length,
    loggedIn: !!auth?.userId,
    reload,
  };
}
