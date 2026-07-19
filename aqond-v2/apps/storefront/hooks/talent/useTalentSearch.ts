'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTalentRawData } from '@/hooks/talent/useTalentRawData';
import { composeTalentSearchIndex, filterTalentSearchResults } from '@/lib/talent/talentSearchCompose';
import { clearTalentSearchRecent, persistTalentSearchRecent, readTalentSearchRecent } from '@/lib/talent/talentSearchRecent';
import type { TalentSearchFilterId } from '@/lib/talent/talentSearchTypes';

export function useTalentSearch() {
  const { raw, loading, error: loadError, loggedIn, reload } = useTalentRawData('search');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<TalentSearchFilterId>('all');
  const [recent, setRecent] = useState<string[]>([]);
  const [partialError, setPartialError] = useState<string | null>(null);

  useEffect(() => {
    setRecent(readTalentSearchRecent());
  }, []);

  useEffect(() => {
    if (!raw) {
      setPartialError(null);
      return;
    }
    const errKeys = Object.keys(raw.errors);
    if (errKeys.length > 0 && errKeys.every((k) => raw.errors[k as keyof typeof raw.errors])) {
      setPartialError('search_sources_partial');
    } else {
      setPartialError(null);
    }
  }, [raw]);

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
    error: loadError ?? partialError,
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
    loggedIn,
    reload,
  };
}
