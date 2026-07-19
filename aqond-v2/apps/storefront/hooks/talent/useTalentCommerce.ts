'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { composeTalentCommerce } from '@/lib/talent/commerce/talentCommerceCompose';
import { loadTalentCommerceRaw } from '@/lib/talent/commerce/talentCommerceSources';
import type { TalentCommercePeriodId } from '@/lib/talent/commerce/talentCommerceTypes';
import type { TalentTodayRaw } from '@/lib/talent/talentTodaySources';

export function useTalentCommerce() {
  const { auth, user } = useAuth();
  const userId = user?.id || auth?.userId;
  const [raw, setRaw] = useState<TalentTodayRaw | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<TalentCommercePeriodId>('week');

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
      const next = await loadTalentCommerceRaw(auth, userId);
      setRaw(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'commerce_unavailable');
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

  const composed = useMemo(
    () => (raw && userId ? composeTalentCommerce(raw, userId, period) : null),
    [raw, userId, period],
  );

  return {
    loading,
    error,
    period,
    setPeriod,
    composed,
    loggedIn: !!auth?.userId,
    reload,
  };
}
