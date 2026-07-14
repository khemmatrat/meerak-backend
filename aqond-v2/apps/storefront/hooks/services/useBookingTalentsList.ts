'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { fetchBookingProviders } from '@/lib/services/bookingApi';
import type { BookingProvider, ExpertCategory } from '@/lib/services/bookingTypes';

const VALID: ExpertCategory[] = [
  'all',
  'chef',
  'tailor',
  'artist',
  'barber',
  'wellness',
  'beauty',
  'party_guest',
];

export function useBookingTalentsList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { auth } = useAuth();
  const catParam = searchParams.get('category') as ExpertCategory | null;
  const category: ExpertCategory =
    catParam && VALID.includes(catParam) ? catParam : 'all';

  const [providers, setProviders] = useState<BookingProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const setCategory = useCallback(
    (cat: ExpertCategory) => {
      const params = new URLSearchParams();
      if (cat !== 'all') params.set('category', cat);
      router.replace(
        params.toString()
          ? `/m/services/booking/talents?${params}`
          : '/m/services/booking/talents',
        { scroll: false },
      );
    },
    [router],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const rows = await fetchBookingProviders(category, auth);
      setProviders(rows);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ');
      setProviders([]);
    } finally {
      setLoading(false);
    }
  }, [auth, category]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = providers.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.name?.toLowerCase().includes(q) ||
      p.signature_service?.toLowerCase().includes(q) ||
      String(p.expert_category || '').toLowerCase().includes(q)
    );
  });

  return {
    providers: filtered,
    loading,
    category,
    setCategory,
    search,
    setSearch,
    err,
    reload: load,
  };
}
