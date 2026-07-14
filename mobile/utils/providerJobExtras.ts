import type { Job } from "../types";

/** คำถาม/โน้ตจากนายจ้างสำหรับผู้รับงาน — เก็บใน payment_details.employer_questions_for_provider */
export function getEmployerQuestionsForProvider(job: Job): string[] {
  const pd = job.payment_details as Record<string, unknown> | undefined;
  const raw = pd?.employer_questions_for_provider;
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  }
  if (typeof raw === "string" && raw.trim()) return [raw.trim()];
  return [];
}

export type TransportStop = { lat: number; lng: number; label?: string };

/** จุดรับ–ส่งจาก transport_contract (งาน Driver) */
export function getDriverTransportStops(job: Job): {
  pickup: TransportStop | null;
  dropoff: TransportStop | null;
} {
  const raw = job.payment_details?.transport_contract;
  if (!raw || typeof raw !== "object") return { pickup: null, dropoff: null };
  const tc = raw as {
    pickup?: { lat?: number; lng?: number; label?: string };
    dropoff?: { lat?: number; lng?: number; label?: string };
  };
  const toStop = (
    p?: { lat?: number; lng?: number; label?: string }
  ): TransportStop | null => {
    if (p == null || p.lat == null || p.lng == null) return null;
    return {
      lat: Number(p.lat),
      lng: Number(p.lng),
      label: p.label ? String(p.label).trim() : undefined,
    };
  };
  return {
    pickup: toStop(tc.pickup),
    dropoff: toStop(tc.dropoff),
  };
}

export function isDriverCategory(job: Job): boolean {
  return String(job.category || "")
    .trim()
    .toLowerCase() === "driver";
}
