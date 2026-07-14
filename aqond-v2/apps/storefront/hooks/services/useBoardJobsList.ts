'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
  fetchBoardJobs,
  fetchMyBoardApplications,
  fetchMyBoardJobs,
  fetchSavedBoardJobs,
  type BoardJobFilters,
  type BoardJobsTab,
} from '@/lib/services/boardJobApi';
import type { BoardJob, BoardJobApplication } from '@/lib/services/boardJobTypes';

const VALID_TABS: BoardJobsTab[] = ['all', 'my-jobs', 'my-applications', 'saved'];

const DEFAULT_FILTERS: BoardJobFilters = {
  q: '',
  category: '',
  target_province: '',
  employment_type: '',
  sort: 'newest',
};

export function useBoardJobsList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { auth } = useAuth();

  const tabParam = searchParams.get('tab') as BoardJobsTab | null;
  const activeTab: BoardJobsTab =
    tabParam && VALID_TABS.includes(tabParam) ? tabParam : 'all';

  const [jobs, setJobs] = useState<BoardJob[]>([]);
  const [applications, setApplications] = useState<BoardJobApplication[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<BoardJobFilters>(() => ({
    ...DEFAULT_FILTERS,
    q: searchParams.get('q') || '',
    category: searchParams.get('category') || '',
    target_province: searchParams.get('target_province') || '',
    employment_type: searchParams.get('employment_type') || '',
    sort: (searchParams.get('sort') as BoardJobFilters['sort']) || 'newest',
  }));

  const setTab = useCallback(
    (tab: BoardJobsTab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', tab);
      router.replace(`/m/services/board?${params}`, { scroll: false });
    },
    [router, searchParams],
  );

  const syncUrlFilters = useCallback(
    (next: BoardJobFilters) => {
      const params = new URLSearchParams();
      params.set('tab', activeTab);
      if (next.q.trim()) params.set('q', next.q.trim());
      if (next.category) params.set('category', next.category);
      if (next.target_province) params.set('target_province', next.target_province);
      if (next.employment_type) params.set('employment_type', next.employment_type);
      if (next.sort !== 'newest') params.set('sort', next.sort);
      router.replace(`/m/services/board?${params}`, { scroll: false });
    },
    [activeTab, router],
  );

  const patchFilters = useCallback(
    (partial: Partial<BoardJobFilters>) => {
      setFilters((prev) => {
        const next = { ...prev, ...partial };
        if (activeTab === 'all') syncUrlFilters(next);
        return next;
      });
    },
    [activeTab, syncUrlFilters],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      if (activeTab === 'all') {
        const out = await fetchBoardJobs(filters, auth);
        setJobs(out.jobs);
        setTotal(out.total);
        setApplications([]);
      } else if (activeTab === 'my-jobs') {
        const rows = await fetchMyBoardJobs(auth);
        setJobs(rows);
        setTotal(rows.length);
        setApplications([]);
      } else if (activeTab === 'my-applications') {
        const rows = await fetchMyBoardApplications(auth);
        setApplications(rows);
        setJobs([]);
        setTotal(rows.length);
      } else {
        const rows = await fetchSavedBoardJobs(auth);
        setJobs(rows);
        setTotal(rows.length);
        setApplications([]);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ');
      setJobs([]);
      setApplications([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [activeTab, auth, filters]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 350);
    return () => clearTimeout(timer);
  }, [load]);

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
    if (activeTab === 'all') syncUrlFilters(DEFAULT_FILTERS);
  };

  const hasActiveFilters =
    !!filters.q.trim() ||
    !!filters.category ||
    !!filters.target_province ||
    !!filters.employment_type ||
    filters.sort !== 'newest';

  return {
    jobs,
    applications,
    total,
    loading,
    err,
    activeTab,
    setTab,
    filters,
    patchFilters,
    showFilters,
    setShowFilters,
    clearFilters,
    hasActiveFilters,
    reload: load,
  };
}
