export type RiderTierId = 'bronze' | 'silver' | 'gold';

export type RiderTier = {
  id: RiderTierId;
  label: string;
  labelTh: string;
  next?: RiderTierId;
  tripsToNext?: number;
};

const TIER_THRESHOLDS: { id: RiderTierId; minTrips: number; label: string; labelTh: string }[] = [
  { id: 'gold', minTrips: 100, label: 'Gold', labelTh: 'โกลด์' },
  { id: 'silver', minTrips: 20, label: 'Silver', labelTh: 'ซิลเวอร์' },
  { id: 'bronze', minTrips: 0, label: 'Bronze', labelTh: 'บรอนซ์' },
];

export function computeRiderTier(completedTrips: number, avgRating?: number | null): RiderTier {
  const trips = Math.max(0, completedTrips);
  let tier = TIER_THRESHOLDS.find((t) => trips >= t.minTrips) || TIER_THRESHOLDS[2];

  // เลื่อนระดับเมื่อเรตติ้งดีมาก (optional boost)
  if (avgRating != null && avgRating >= 4.8 && trips >= 15 && tier.id === 'bronze') {
    tier = TIER_THRESHOLDS.find((t) => t.id === 'silver')!;
  }

  const order: RiderTierId[] = ['bronze', 'silver', 'gold'];
  const idx = order.indexOf(tier.id);
  const next = idx > 0 ? order[idx - 1] : undefined;
  const nextThreshold = next
    ? TIER_THRESHOLDS.find((t) => t.id === next)?.minTrips ?? 0
    : undefined;
  const tripsToNext = nextThreshold != null ? Math.max(0, nextThreshold - trips) : undefined;

  return {
    id: tier.id,
    label: tier.label,
    labelTh: tier.labelTh,
    next,
    tripsToNext,
  };
}

export function formatAcceptanceRate(rate: number): { headline: string; tone: 'great' | 'good' | 'ok' | 'low' } {
  const r = Math.max(0, Math.min(100, Math.round(rate)));
  if (r >= 90) return { headline: `อัตรารับงาน ${r}% — ดีมาก`, tone: 'great' };
  if (r >= 75) return { headline: `อัตรารับงาน ${r}% — ดี`, tone: 'good' };
  if (r >= 50) return { headline: `อัตรารับงาน ${r}% — ปานกลาง`, tone: 'ok' };
  return { headline: `อัตรารับงาน ${r}% — ลองรับงานเพิ่มนะ`, tone: 'low' };
}

/** นับวันติดต่อกันที่มีงานสำเร็จ (ย้อนจากวันนี้) */
export function computeDeliveryStreak(completedDates: string[]): number {
  if (!completedDates.length) return 0;

  const days = new Set(
    completedDates.map((iso) => {
      try {
        return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
      } catch {
        return '';
      }
    }).filter(Boolean),
  );

  let streak = 0;
  const cursor = new Date();
  for (let i = 0; i < 365; i++) {
    const key = cursor.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
    if (!days.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function weekStartBangkok(): Date {
  const now = new Date();
  const bangkok = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const day = bangkok.getDay();
  const diff = day === 0 ? 6 : day - 1;
  bangkok.setDate(bangkok.getDate() - diff);
  bangkok.setHours(0, 0, 0, 0);
  const offset = now.getTime() - new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })).getTime();
  return new Date(bangkok.getTime() + offset);
}
