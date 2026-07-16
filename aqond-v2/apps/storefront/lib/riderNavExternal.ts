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

/** Pickup vs dropoff based on active job phase */
export function navTargetForPhase(
  phase: string | undefined,
  pickup: NavTarget,
  dropoff: NavTarget,
): NavTarget {
  const toPickup =
    phase === 'rider_assigned' ||
    phase === 'finding_rider' ||
    phase === 'food_ready' ||
    phase === 'pending_accept';
  return toPickup ? pickup : dropoff;
}
