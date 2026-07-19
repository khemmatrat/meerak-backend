'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import {
  readTalentCacheEntry,
  talentRawCacheKey,
} from '@/lib/talent/cache/talentDataCache';
import { loadTalentChatCached } from '@/lib/talent/cache/talentRawLoaders';
import {
  composeTalentChatConversations,
  countTalentChatUnread,
  filterTalentChatConversations,
  recentTalentChatConversations,
  type TalentChatRaw,
} from '@/lib/talent/talentChatCompose';
import type { TalentChatFilterId } from '@/lib/talent/talentChatTypes';

export function useTalentChatWorkspace() {
  const { auth, user } = useAuth();
  const userId = user?.id || auth?.userId;
  const cacheKey = userId ? talentRawCacheKey('chat', userId) : null;

  const [raw, setRaw] = useState<TalentChatRaw | null>(() => {
    if (!cacheKey) return null;
    return readTalentCacheEntry<TalentChatRaw>(cacheKey)?.data ?? null;
  });
  const [loading, setLoading] = useState(() => {
    if (!auth?.userId || !userId) return false;
    if (cacheKey && readTalentCacheEntry(cacheKey)) return false;
    return true;
  });
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<TalentChatFilterId>('all');

  const reload = useCallback(
    async (force = false) => {
      if (!auth?.userId || !userId) {
        setRaw(null);
        setError(null);
        setLoading(false);
        return;
      }

      if (!force && cacheKey) {
        const hit = readTalentCacheEntry<TalentChatRaw>(cacheKey);
        if (hit) {
          setRaw(hit.data);
          setError(null);
          setLoading(false);
          return;
        }
      }

      setLoading(true);
      setError(null);
      try {
        const next = await loadTalentChatCached(auth, userId, force);
        setRaw(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'chat_unavailable');
        setRaw(null);
      } finally {
        setLoading(false);
      }
    },
    [auth, userId, cacheKey],
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
    reload: () => reload(true),
  };
}
