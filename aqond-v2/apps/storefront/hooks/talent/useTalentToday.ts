'use client';

import { useMemo } from 'react';
import { useTalentRawData } from '@/hooks/talent/useTalentRawData';
import { composeTalentToday, type TalentTodayComposed } from '@/lib/talent/talentTodayCompose';

export function useTalentToday() {
  const { raw, loading, userId, loggedIn, reload } = useTalentRawData('today');

  const composed = useMemo<TalentTodayComposed | null>(
    () => (raw && userId ? composeTalentToday(raw, userId) : null),
    [raw, userId],
  );

  return {
    loading,
    raw,
    composed,
    userId,
    loggedIn,
    reload,
  };
}
