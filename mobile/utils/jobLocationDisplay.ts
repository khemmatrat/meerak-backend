/**
 * แสดงที่อยู่แบบที่ผู้ใช้ในเอเชียคุ้น — ไม่โชว์ Lat/Lng เป็นหลัก
 */
import { getTransportPickupDropoffText } from "./transportJobLabels";

export type JobLikeForAddress = {
  title?: string;
  category?: string;
  location?: {
    fullAddress?: string;
    lat?: number;
    lng?: number;
    district?: string;
    area?: string;
    province?: string;
  } | null;
  payment_details?: { transport_contract?: unknown } | null;
};

export function formatJobPrimaryAddress(job: JobLikeForAddress): string {
  const loc = job.location;
  const tc = job.payment_details?.transport_contract as
    | { dropoff?: { label?: string } }
    | undefined;
  if (tc?.dropoff?.label?.trim()) return tc.dropoff.label.trim();
  if (loc?.fullAddress?.trim()) return loc.fullAddress.trim();
  const parts = [loc?.area, loc?.district, loc?.province].filter(
    (x): x is string => !!x && String(x).trim().length > 0
  );
  if (parts.length) return parts.join(" ");
  if (job.title?.trim()) return job.title.trim();
  return "";
}

/** บรรทัดสำหรับการ์ด (รับ–ส่ง หรือบรรทัดเดียว) — ไม่คืน Lat/Lng */
export function getJobLocationDisplayLines(job: JobLikeForAddress): {
  line1: string;
  line1LabelKey: "pin_pickup" | "pin_summary";
  line2: string;
  line2LabelKey: "pin_dropoff" | "pin_location";
  isTransportRoute: boolean;
} {
  const route = getTransportPickupDropoffText(job);
  if (route) {
    return {
      line1: route.pickup,
      line1LabelKey: "pin_pickup",
      line2: route.dropoff,
      line2LabelKey: "pin_dropoff",
      isTransportRoute: true,
    };
  }
  const addr = formatJobPrimaryAddress(job);
  const title = job.title?.trim() || "";
  return {
    line1: title || addr || "—",
    line1LabelKey: "pin_summary",
    line2: addr || title || "—",
    line2LabelKey: "pin_location",
    isTransportRoute: false,
  };
}
