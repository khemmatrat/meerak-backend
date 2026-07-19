'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import {
  composeTalentChatConversations,
  countTalentChatUnread,
  filterTalentChatConversations,
  recentTalentChatConversations,
  type TalentChatRaw,
} from '@/lib/talent/talentChatCompose';
import { loadTalentChatRaw } from '@/lib/talent/talentChatSources';
import type { TalentChatFilterId } from '@/lib/talent/talentChatTypes';

export function useTalentChatWorkspace() {
  const { auth, user } = useAuth();
  const userId = user?.id || auth?.userId;
  const [raw, setRaw] = useState<TalentChatRaw | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<TalentChatFilterId>('all');

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
      const next = await loadTalentChatRaw(auth, userId);
      setRaw(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'chat_unavailable');
      setRaw(null);
    } finally {
      setLoading(false);
    }
  }, [auth, userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const all = useMemo(
    () => (raw && userId ? composeTalentChatConversations(raw, userId) : []),
    [raw, userId],
  );

  const filtered = useMemo(
    () => filterTalentChatConversations(all, query, filter),
    [all, query, filter],
  );

  const recent = useMemo(() => recentTalentChatConversations(all), [all]);
  const unread = useMemo(() => all.filter((c) => c.unread), [all]);
  const unreadCount = useMemo(() => countTalentChatUnread(all), [all]);

  return {
    loading,
    error,
    query,
    setQuery,
    filter,
    setFilter,
    all,
    filtered,
    recent,
    unread,
    unreadCount,
    loggedIn: !!auth?.userId,
    reload,
  };
}
