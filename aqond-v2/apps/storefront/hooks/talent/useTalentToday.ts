'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { composeTalentToday, type TalentTodayComposed } from '@/lib/talent/talentTodayCompose';
import { loadTalentTodayRaw, type TalentTodayRaw } from '@/lib/talent/talentTodaySources';

export function useTalentToday() {
  const { auth, user } = useAuth();
  const userId = user?.id || auth?.userId;
  const [raw, setRaw] = useState<TalentTodayRaw | null>(null);
  const [composed, setComposed] = useState<TalentTodayComposed | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!auth?.userId || !userId) {
      setRaw(null);
      setComposed(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const next = await loadTalentTodayRaw(auth, userId);
    setRaw(next);
    setComposed(composeTalentToday(next, userId));
    setLoading(false);
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

  return {
    loading,
    raw,
    composed,
    userId,
    loggedIn: !!auth?.userId,
    reload,
  };
}
