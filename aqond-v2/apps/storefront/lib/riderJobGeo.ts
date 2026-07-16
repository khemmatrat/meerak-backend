import type { RiderJob } from '@/lib/rider';

export type RiderGps = { lat: number; lng: number };

export type EnrichedRiderJob = RiderJob & {
  distance_km?: number;
  eta_pickup_min?: number;
  eta_total_min?: number;
  estimated_earning_micro?: number;
  recipient_name?: string;
};

const EARTH_KM = 6371;
const RIDER_SPEED_KMH = 28;

export function haversineKm(a: RiderGps, b: RiderGps): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return EARTH_KM * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function etaMinutes(distanceKm: number, speedKmh = RIDER_SPEED_KMH): number {
  if (!(distanceKm > 0)) return 0;
  return Math.max(3, Math.round((distanceKm / speedKmh) * 60));
}

/** รายได้ไรเดอร์โดยประมาณ ~18% ของมูลค่างาน */
export function estimateRiderEarningMicro(amountMicro?: number): number {
  return Math.max(0, Math.round(Number(amountMicro || 0) * 0.18));
}

export function enrichJobWithGeo(job: RiderJob, riderGps: RiderGps | null): EnrichedRiderJob {
  const enriched: EnrichedRiderJob = {
    ...job,
    estimated_earning_micro: estimateRiderEarningMicro(job.amount_micro),
  };
  if (!riderGps || job.pickup_lat == null || job.pickup_lng == null) return enriched;

  const toPickup = haversineKm(riderGps, { lat: job.pickup_lat, lng: job.pickup_lng });
  let toDropoff = 0;
  if (job.dropoff_lat != null && job.dropoff_lng != null) {
    toDropoff = haversineKm(
      { lat: job.pickup_lat, lng: job.pickup_lng },
      { lat: job.dropoff_lat, lng: job.dropoff_lng },
    );
  }
  const totalKm = toPickup + toDropoff;
  enriched.distance_km = Math.round(toPickup * 10) / 10;
  enriched.eta_pickup_min = etaMinutes(toPickup);
  enriched.eta_total_min = etaMinutes(totalKm);
  return enriched;
}

export function sortJobsByDistance(jobs: EnrichedRiderJob[]): EnrichedRiderJob[] {
  return [...jobs].sort((a, b) => {
    const da = a.distance_km ?? 999;
    const db = b.distance_km ?? 999;
    if (da !== db) return da - db;
    return Number(a.amount_micro || 0) - Number(b.amount_micro || 0);
  });
}

export function formatDistanceKm(km?: number): string {
  if (km == null) return '—';
  if (km < 1) return `${Math.round(km * 1000)} ม.`;
  return `${km.toFixed(1)} กม.`;
}

export function formatEta(min?: number): string {
  if (min == null || min <= 0) return '—';
  return `~${min} นาที`;
}
