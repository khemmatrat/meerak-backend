'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
  fetchMatchJobSearchSuggestions,
  fetchMatchJobs,
} from '@/lib/services/matchJobApi';
import type { MatchJob } from '@/lib/services/matchJobTypes';

export function useMatchJobsList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { auth } = useAuth();
  const categoryFromUrl = searchParams.get('category') || 'All';
  const searchFromUrl = (searchParams.get('search') || '').trim();

  const [jobs, setJobs] = useState<MatchJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState(categoryFromUrl);
  const [searchQuery, setSearchQuery] = useState(searchFromUrl);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const hubRef = useRef<HTMLDivElement>(null);

  const selectCategory = useCallback(
    (cat: string) => {
      setCategory(cat);
      const params = new URLSearchParams();
      if (cat !== 'All') params.set('category', cat);
      if (searchQuery) params.set('search', searchQuery);
      const q = params.toString();
      router.replace(q ? `/m/services/match?${q}` : '/m/services/match', { scroll: false });
    },
    [router, searchQuery],
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setCategory(searchParams.get('category') || 'All');
    setSearchQuery((searchParams.get('search') || '').trim());
  }, [searchParams]);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchMatchJobs(category, searchQuery, auth);
      setJobs(list);
    } catch (e) {
      console.error('loadJobs', e);
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [category, searchQuery, auth]);

  useEffect(() => {
    const timer = setTimeout(() => void loadJobs(), 400);
    return () => clearTimeout(timer);
  }, [loadJobs]);

  const handleSearchChange = async (value: string) => {
    setSearchQuery(value);
    const params = new URLSearchParams();
    if (category !== 'All') params.set('category', category);
    if (value) params.set('search', value);
    const q = params.toString();
    router.replace(q ? `/m/services/match?${q}` : '/m/services/match', { scroll: false });

    if (value.length > 1) {
      try {
        const results = await fetchMatchJobSearchSuggestions(value);
        setSuggestions(results);
        setShowSuggestions(true);
      } catch {
        setSuggestions([]);
      }
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (term: string) => {
    void handleSearchChange(term);
    setShowSuggestions(false);
  };

  const clearSearch = () => {
    void handleSearchChange('');
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const scrollToHub = () => {
    hubRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const popularPick = (cat: string) => {
    selectCategory(cat);
    hubRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const focusSearch = () => {
    if (searchQuery.length > 1) setShowSuggestions(true);
  };

  return {
    jobs,
    loading,
    category,
    searchQuery,
    suggestions,
    showSuggestions,
    searchRef,
    hubRef,
    selectCategory,
    handleSearchChange,
    selectSuggestion,
    clearSearch,
    scrollToHub,
    popularPick,
    focusSearch,
    reload: loadJobs,
  };
}
