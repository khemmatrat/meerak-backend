'use client';

import { useMemo, useState } from 'react';
import { useTalentRawData } from '@/hooks/talent/useTalentRawData';
import {
  composeTalentTimelineEvents,
  filterTalentTimelineByPeriod,
  groupTalentTimelineByDay,
  sortTalentTimelineNewestFirst,
} from '@/lib/talent/talentTimelineCompose';
import type { TalentTimelinePeriodId } from '@/lib/talent/talentTimelineTypes';

export function useTalentTimeline() {
  const { raw, loading, error, loggedIn, reload } = useTalentRawData('search');
  const [period, setPeriod] = useState<TalentTimelinePeriodId>('week');

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
    loggedIn,
    reload,
  };
}
