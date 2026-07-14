'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
  createBookingRequest,
  fetchBookingTalentProfile,
  fetchBookingTalentSlots,
} from '@/lib/services/bookingApi';
import type { BookingSlot, BookingTalentProfile } from '@/lib/services/bookingTypes';

export function useBookingTalentDetail(talentId: string) {
  const router = useRouter();
  const { auth, user } = useAuth();
  const [profile, setProfile] = useState<BookingTalentProfile | undefined>();
  const [slots, setSlots] = useState<BookingSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<BookingSlot | null>(null);
  const [depositAmount, setDepositAmount] = useState('500');
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [prof, slotRows] = await Promise.all([
        fetchBookingTalentProfile(talentId, auth),
        fetchBookingTalentSlots(talentId, auth),
      ]);
      setProfile(prof);
      setSlots(slotRows);
      if (!prof) setErr('ไม่พบโปรไฟล์');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [auth, talentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitBooking = useCallback(async () => {
    if (!selectedSlot) return;
    if (!user?.id) {
      router.push(`/m/login?next=/m/services/booking/talents/${talentId}`);
      return;
    }
    const deposit = Number(depositAmount);
    if (deposit < 1) {
      setErr('มัดจำอย่างน้อย ฿1');
      return;
    }
    setBooking(true);
    setErr(null);
    setMsg(null);
    try {
      await createBookingRequest(
        {
          slot_id: selectedSlot.id,
          talent_id: talentId,
          deposit_amount: deposit,
        },
        auth,
      );
      setMsg('จองคิวสำเร็จ — รอ Talent ยืนยัน แล้วชำระมัดจำที่ My Bookings');
      setSelectedSlot(null);
      setSlots((prev) => prev.filter((s) => s.id !== selectedSlot.id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'จองไม่สำเร็จ');
    } finally {
      setBooking(false);
    }
  }, [auth, depositAmount, router, selectedSlot, talentId, user?.id]);

  return {
    profile,
    slots,
    loading,
    booking,
    selectedSlot,
    setSelectedSlot,
    depositAmount,
    setDepositAmount,
    err,
    msg,
    submitBooking,
    reload: load,
  };
}
