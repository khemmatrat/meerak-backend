/**
 * ข้อความจุดรับ–ส่งสำหรับงาน Driver ที่มี transport_contract (Transport Hub)
 * ไม่แสดง Lat/Lng — ใช้ label หรือที่อยู่/ชื่องานแทน
 */

export function getTransportPickupDropoffText(job: {
  category?: string;
  title?: string;
  payment_details?: { transport_contract?: unknown } | null;
  location?: { fullAddress?: string; lat?: number; lng?: number } | null;
}): { pickup: string; dropoff: string } | null {
  if ((job.category || "").trim() !== "Driver") return null;
  const raw = job.payment_details?.transport_contract;
  if (!raw || typeof raw !== "object") return null;
  const tc = raw as {
    pickup?: { lat?: number; lng?: number; label?: string };
    dropoff?: { lat?: number; lng?: number; label?: string };
  };
  if (!tc.pickup && !tc.dropoff) return null;

  const addr = job.location?.fullAddress?.trim() || "";
  const title = job.title?.trim() || "";

  const pickup =
    (tc.pickup?.label && String(tc.pickup.label).trim()) ||
    addr ||
    title ||
    "—";

  const dropoff =
    (tc.dropoff?.label && String(tc.dropoff.label).trim()) ||
    addr ||
    "—";

  return { pickup, dropoff };
}
