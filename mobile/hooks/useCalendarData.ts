/**
 * useCalendarData — รวม Jobs, Bookings, Availability เป็น events สำหรับปฏิทิน
 * Color: Emerald (Jobs), Sky (Bookings), Amber (Availability)
 */
import { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";

export type CalendarEventType = "job" | "booking" | "availability";

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  type: CalendarEventType;
  backgroundColor: string;
  borderColor?: string;
  extendedProps: {
    type: CalendarEventType;
    jobId?: string;
    bookingId?: string;
    slotId?: string;
    clientName?: string;
    talentName?: string;
    status?: string;
  };
}

interface JobRaw {
  id: string;
  title?: string;
  datetime?: string;
  created_at?: string;
  status?: string;
  created_by?: string;
  accepted_by?: string;
  created_by_name?: string;
  accepted_by_name?: string;
}

interface BookingRaw {
  id: string;
  start_time: string;
  end_time: string;
  status?: string;
  talent_name?: string | null;
}

interface SlotRaw {
  id: string;
  start_time: string;
  end_time: string;
}

const JOB_COLOR = "#10b981"; // emerald
const BOOKING_COLOR = "#0ea5e9"; // sky
const AVAILABILITY_COLOR = "#f59e0b"; // amber

export function useCalendarData(userId: string | undefined) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!userId) {
      setEvents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [jobsRes, bookingsRes, slotsRes] = await Promise.allSettled([
        api.get<JobRaw[]>(`/users/jobs/${userId}`),
        api.get<{ bookings?: BookingRaw[] }>("/bookings/my-requests"),
        api.get<{ slots?: SlotRaw[] }>("/availability/me/slots"),
      ]);

      const calEvents: CalendarEvent[] = [];

      // Jobs — hired/working (มีผู้รับงาน หรือ งานที่รับอยู่)
      const jobs = jobsRes.status === "fulfilled" ? (jobsRes.value.data || []) : [];
      const jobStatuses = ["accepted", "in_progress", "waiting_for_approval", "waiting_for_payment", "dispute", "completed"];
      jobs.forEach((j: JobRaw) => {
        const status = (j.status || "").toLowerCase();
        if (!jobStatuses.includes(status)) return;
        const dt = j.datetime || j.created_at;
        if (!dt) return;
        const d = new Date(dt);
        const end = new Date(d.getTime() + 60 * 60 * 1000); // +1 ชม.
        const clientName = j.created_by === userId ? (j.accepted_by_name || "ผู้รับงาน") : (j.created_by_name || "ลูกค้า");
        calEvents.push({
          id: `job-${j.id}`,
          title: (j.title || "งาน") + (j.accepted_by ? " ✓" : ""),
          start: d,
          end,
          type: "job",
          backgroundColor: JOB_COLOR,
          borderColor: JOB_COLOR,
          extendedProps: {
            type: "job",
            jobId: j.id,
            clientName,
            status: j.status,
          },
        });
      });

      // Bookings
      const bookings = bookingsRes.status === "fulfilled" ? (bookingsRes.value.data?.bookings || []) : [];
      bookings.forEach((b: BookingRaw) => {
        if (!b.start_time || !b.end_time) return;
        const start = new Date(b.start_time);
        const end = new Date(b.end_time);
        calEvents.push({
          id: `booking-${b.id}`,
          title: `จอง: ${b.talent_name || "Talent"}`,
          start,
          end,
          type: "booking",
          backgroundColor: BOOKING_COLOR,
          borderColor: BOOKING_COLOR,
          extendedProps: {
            type: "booking",
            bookingId: b.id,
            talentName: b.talent_name || undefined,
            status: b.status,
          },
        });
      });

      // Availability slots
      const slots = slotsRes.status === "fulfilled" ? (slotsRes.value.data?.slots || []) : [];
      const now = new Date();
      slots.forEach((s: SlotRaw) => {
        const start = new Date(s.start_time);
        const end = new Date(s.end_time);
        if (end < now) return; // ไม่แสดง slot ที่ผ่านมาแล้ว
        calEvents.push({
          id: `slot-${s.id}`,
          title: "เวลาว่าง",
          start,
          end,
          type: "availability",
          backgroundColor: "rgba(245, 158, 11, 0.3)",
          borderColor: AVAILABILITY_COLOR,
          extendedProps: {
            type: "availability",
            slotId: s.id,
          },
        });
      });

      setEvents(calEvents);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return { events, loading, error, refetch: fetchAll };
}
