/**
 * Rider OS vehicle categories — aligned with AQOND transport tiers.
 */
export type RiderVehicleId =
  | 'motorcycle'
  | 'car'
  | 'suv'
  | 'pickup'
  | 'van'
  | 'public_transport';

export type RiderVehicleOption = {
  id: RiderVehicleId;
  labelTh: string;
  labelEn: string;
  icon: string;
  /** Job types this vehicle can accept */
  jobTypes: Array<'food' | 'parcel' | 'passenger'>;
};

export const RIDER_VEHICLE_OPTIONS: RiderVehicleOption[] = [
  { id: 'motorcycle', labelTh: 'มอเตอร์ไซค์', labelEn: 'Motorcycle', icon: '🛵', jobTypes: ['food', 'parcel'] },
  { id: 'car', labelTh: 'รถยนต์ (Standard)', labelEn: 'Standard Car', icon: '🚗', jobTypes: ['food', 'parcel', 'passenger'] },
  { id: 'suv', labelTh: 'SUV / 7 ที่นั่ง', labelEn: 'SUV', icon: '🚙', jobTypes: ['food', 'parcel', 'passenger'] },
  { id: 'pickup', labelTh: 'กระบะ / รถบรรทุก', labelEn: 'Pickup', icon: '🛻', jobTypes: ['parcel'] },
  { id: 'van', labelTh: 'รถตู้ / Van', labelEn: 'Van', icon: '🚐', jobTypes: ['parcel', 'passenger'] },
  {
    id: 'public_transport',
    labelTh: 'รถสาธารณะ (ป้ายเหลือง)',
    labelEn: 'Public transport',
    icon: '🚌',
    jobTypes: ['passenger'],
  },
];

export function riderVehicleLabel(id?: string | null): string {
  const hit = RIDER_VEHICLE_OPTIONS.find((v) => v.id === String(id || '').toLowerCase());
  if (hit) return hit.labelTh;
  const raw = String(id || '').trim();
  if (!raw) return 'มอเตอร์ไซค์';
  return raw;
}

export function riderVehicleIcon(id?: string | null): string {
  const hit = RIDER_VEHICLE_OPTIONS.find((v) => v.id === String(id || '').toLowerCase());
  return hit?.icon || '🛵';
}

export function normalizeRiderVehicleId(raw?: string | null): RiderVehicleId {
  const s = String(raw || 'motorcycle').toLowerCase();
  const hit = RIDER_VEHICLE_OPTIONS.find((v) => v.id === s);
  return hit?.id || 'motorcycle';
}

/** Whether a rider vehicle may accept a dispatch job_type (aligned with dispatch-svc). */
export function vehicleAllowsJobType(vehicle: string, jobType: string): boolean {
  const jt = String(jobType || '').toLowerCase().trim();
  if (!jt) return true;
  const vid = normalizeRiderVehicleId(vehicle);
  const opt = RIDER_VEHICLE_OPTIONS.find((v) => v.id === vid);
  if (!opt) return true;
  return opt.jobTypes.includes(jt as 'food' | 'parcel' | 'passenger');
}
