/** One-tap external navigation — Google Maps, Waze, Apple Maps */

export type NavTarget = { lat: number; lng: number; label?: string };

export function googleMapsDirectionsUrl(target: NavTarget): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}`;
}

export function wazeNavigateUrl(target: NavTarget): string {
  return `https://waze.com/ul?ll=${target.lat}%2C${target.lng}&navigate=yes`;
}

export function appleMapsDirectionsUrl(target: NavTarget): string {
  const q = encodeURIComponent(target.label || `${target.lat},${target.lng}`);
  return `https://maps.apple.com/?daddr=${target.lat},${target.lng}&q=${q}`;
}

export function openExternalNav(app: 'google' | 'waze' | 'apple', target: NavTarget) {
  const url =
    app === 'waze'
      ? wazeNavigateUrl(target)
      : app === 'apple'
        ? appleMapsDirectionsUrl(target)
        : googleMapsDirectionsUrl(target);
  window.open(url, '_blank', 'noopener,noreferrer');
}

const PICKUP_PHASES = new Set([
  'rider_assigned',
  'finding_rider',
  'food_ready',
  'pending_accept',
  'arrived_merchant',
  'en_route_pickup',
  'pickup',
  'at_pickup',
]);

/** Whether navigation target is pickup (vs dropoff). */
export function isNavToPickup(phase?: string, jobType?: string): boolean {
  const p = String(phase || '').toLowerCase();
  if (jobType === 'passenger' && (p === 'passenger_pickup' || p === 'at_pickup')) return true;
  if (PICKUP_PHASES.has(p)) return true;
  return p.includes('pickup') || p.includes('merchant');
}

export function navLabelForPhase(phase?: string, jobType?: string): string {
  if (isNavToPickup(phase, jobType)) {
    return jobType === 'passenger' ? 'ไปจุดรับ' : 'ไปร้าน';
  }
  return 'ไปจุดส่ง';
}

export function navTargetForPhase(
  phase: string | undefined,
  pickup: NavTarget,
  dropoff: NavTarget,
  jobType?: string,
): NavTarget {
  return isNavToPickup(phase, jobType) ? pickup : dropoff;
}

/** Immersive map chrome while actively navigating. */
export function isRiderNavFullscreen(phase?: string, status?: string): boolean {
  const st = String(status || '').toLowerCase();
  if (st === 'completed' || st === 'cancelled') return false;
  const p = String(phase || '').toLowerCase();
  return (
    p === 'en_route_pickup' ||
    p === 'en_route_dropoff' ||
    p === 'navigating' ||
    p === 'handoff' ||
    p === 'cod_payment' ||
    p === 'arrived_merchant'
  );
}
