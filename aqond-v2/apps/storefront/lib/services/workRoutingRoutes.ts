import type { WorkSurface } from './workTaxonomy';
import { WORK_SURFACES } from './workTaxonomy';

export const SURFACE_ROUTES: Record<WorkSurface, string> = {
  match_job: '/m/services/match/create',
  jobboard: '/m/services/board/create',
  booking: '/m/services/booking/talents',
  videofeed: '/m/services/video',
};

export function surfaceLabel(surface: WorkSurface | string): string {
  const found = WORK_SURFACES.find((s) => s.id === surface);
  return found?.label || String(surface);
}

export function surfaceCreateHref(surface: WorkSurface): string {
  return SURFACE_ROUTES[surface];
}

export function otherSurfaceLinks(
  current: WorkSurface,
): { surface: WorkSurface; href: string; label: string }[] {
  return (Object.keys(SURFACE_ROUTES) as WorkSurface[])
    .filter((s) => s !== current)
    .map((surface) => ({
      surface,
      href: SURFACE_ROUTES[surface],
      label: surfaceLabel(surface),
    }));
}
