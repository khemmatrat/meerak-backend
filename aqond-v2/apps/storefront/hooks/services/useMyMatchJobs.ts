'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { fetchMyMatchJobs } from '@/lib/services/matchJobApi';
import type { MatchJob } from '@/lib/services/matchJobTypes';
import {
  filterMyMatchJobs,
  type MyMatchJobsTab,
} from '@/lib/services/myMatchJobsFilter';

const JUST_CREATED_KEY = 'meerak_justCreatedJob';
const VALID_TABS: MyMatchJobsTab[] = ['posted', 'hire', 'working', 'recommended', 'history'];

export function useMyMatchJobs() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { auth, user } = useAuth();
  const tabParam = searchParams.get('tab') as MyMatchJobsTab | null;
  const activeTab: MyMatchJobsTab =
    tabParam && VALID_TABS.includes(tabParam) ? tabParam : 'posted';

  const [jobs, setJobs] = useState<MatchJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [showExpired, setShowExpired] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const justCreatedRef = useRef<MatchJob | null>(null);

  if (!justCreatedRef.current && typeof window !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(JUST_CREATED_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as MatchJob;
        if (parsed?.id) {
          justCreatedRef.current = parsed;
          sessionStorage.removeItem(JUST_CREATED_KEY);
        }
      }
    } catch {
      /* ignore */
    }
  }

  const setTab = useCallback(
    (tab: MyMatchJobsTab) => {
      router.replace(`/m/services/match/mine?tab=${tab}`, { scroll: false });
    },
    [router],
  );

  const load = useCallback(async () => {
    if (!user?.id) {
      setJobs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setMsg(null);
    try {
      const all = await fetchMyMatchJobs(user.id, auth, { includeExpired: showExpired });
      if (justCreatedRef.current?.id) {
        const byId = new Map(all.map((j) => [String(j.id), j]));
        byId.set(String(justCreatedRef.current.id), justCreatedRef.current);
        const merged = Array.from(byId.values());
        setJobs(filterMyMatchJobs(merged, activeTab, user.id, { showExpired }));
      } else {
        setJobs(filterMyMatchJobs(all, activeTab, user.id, { showExpired }));
      }
    } catch (e) {
      console.error('useMyMatchJobs', e);
      setJobs([]);
      setMsg('โหลดรายการงานไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [activeTab, auth, showExpired, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && user?.id) void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load, user?.id]);

  return {
    jobs,
    loading,
    activeTab,
    setTab,
    showExpired,
    setShowExpired,
    msg,
    userId: user?.id,
    reload: load,
  };
}
