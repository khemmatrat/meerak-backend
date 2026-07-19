'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { composeTalentSearchIndex, filterTalentSearchResults } from '@/lib/talent/talentSearchCompose';
import { clearTalentSearchRecent, persistTalentSearchRecent, readTalentSearchRecent } from '@/lib/talent/talentSearchRecent';
import { loadTalentSearchRaw } from '@/lib/talent/talentSearchSources';
import type { TalentSearchFilterId } from '@/lib/talent/talentSearchTypes';
import type { TalentTodayRaw } from '@/lib/talent/talentTodaySources';

export function useTalentSearch() {
  const { auth, user } = useAuth();
  const userId = user?.id || auth?.userId;
  const [raw, setRaw] = useState<TalentTodayRaw | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<TalentSearchFilterId>('all');
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    setRecent(readTalentSearchRecent());
  }, []);

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
      const next = await loadTalentSearchRaw(auth, userId);
      setRaw(next);
      const errKeys = Object.keys(next.errors);
      if (errKeys.length > 0 && errKeys.every((k) => next.errors[k as keyof typeof next.errors])) {
        setError('search_sources_partial');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'search_unavailable');
      setRaw(null);
    } finally {
      setLoading(false);
    }
  }, [auth, userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const index = useMemo(() => (raw ? composeTalentSearchIndex(raw) : []), [raw]);

  const results = useMemo(
    () => filterTalentSearchResults(index, query, filter),
    [index, query, filter],
  );

  const submitQuery = useCallback(
    (nextQuery: string) => {
      const trimmed = nextQuery.trim();
      setQuery(trimmed);
      if (trimmed) setRecent(persistTalentSearchRecent(trimmed));
    },
    [],
  );

  const applySuggestion = useCallback((suggestedQuery: string, suggestedFilter: TalentSearchFilterId) => {
    setFilter(suggestedFilter);
    submitQuery(suggestedQuery);
  }, [submitQuery]);

  const clearRecent = useCallback(() => {
    clearTalentSearchRecent();
    setRecent([]);
  }, []);

  return {
    loading,
    error,
    query,
    filter,
    setFilter,
    setQuery,
    submitQuery,
    applySuggestion,
    results,
    index,
    recent,
    clearRecent,
    loggedIn: !!auth?.userId,
    reload,
  };
}
