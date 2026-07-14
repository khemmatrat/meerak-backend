'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
  fetchIncomingBookings,
  fetchMyBookingRequests,
  patchBookingStatus,
  payBookingDeposit,
} from '@/lib/services/bookingApi';
import type { BookingItem, BookingTab } from '@/lib/services/bookingTypes';

export function useMyBookings() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { auth } = useAuth();
  const tabParam = searchParams.get('tab') as BookingTab | null;
  const activeTab: BookingTab =
    tabParam === 'incoming' ? 'incoming' : 'my-requests';

  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const setTab = useCallback(
    (tab: BookingTab) => {
      router.replace(`/m/services/booking/mine?tab=${tab}`, { scroll: false });
    },
    [router],
  );

  const load = useCallback(async () => {
    if (!auth?.userId) {
      setBookings([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const rows =
        activeTab === 'incoming'
          ? await fetchIncomingBookings(auth)
          : await fetchMyBookingRequests(auth);
      setBookings(rows);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ');
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, auth]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmBooking = useCallback(
    async (bookingId: string) => {
      setActingId(bookingId);
      setErr(null);
      try {
        await patchBookingStatus(bookingId, 'confirmed', auth);
        setMsg('ยืนยันคิวแล้ว');
        await load();
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'ยืนยันไม่สำเร็จ');
      } finally {
        setActingId(null);
      }
    },
    [auth, load],
  );

  const cancelBooking = useCallback(
    async (bookingId: string) => {
      setActingId(bookingId);
      setErr(null);
      try {
        await patchBookingStatus(bookingId, 'cancelled', auth);
        setMsg('ยกเลิกแล้ว');
        await load();
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'ยกเลิกไม่สำเร็จ');
      } finally {
        setActingId(null);
      }
    },
    [auth, load],
  );

  const payDeposit = useCallback(
    async (bookingId: string) => {
      setActingId(bookingId);
      setErr(null);
      try {
        await payBookingDeposit(bookingId, auth);
        setMsg('ชำระมัดจำสำเร็จ');
        await load();
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'ชำระมัดจำไม่สำเร็จ');
      } finally {
        setActingId(null);
      }
    },
    [auth, load],
  );

  return {
    bookings,
    loading,
    activeTab,
    setTab,
    actingId,
    err,
    msg,
    userId: auth?.userId,
    confirmBooking,
    cancelBooking,
    payDeposit,
    reload: load,
  };
}
