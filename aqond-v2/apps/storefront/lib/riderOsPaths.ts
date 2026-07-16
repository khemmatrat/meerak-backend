/** Canonical Rider OS URL prefix (storefront embed + direct web). */
export const RIDER_OS_BASE = '/storefront/rider-os';

export function riderOsPath(sub = ''): string {
  if (!sub || sub === '/') return `${RIDER_OS_BASE}/home`;
  const normalized = sub.startsWith('/') ? sub : `/${sub}`;
  return `${RIDER_OS_BASE}${normalized}`;
}

/** Match rider tab routes for both legacy /m/rider and canonical /storefront/rider-os. */
export function isRiderOsPath(pathname: string): boolean {
  return (
    pathname.startsWith('/storefront/rider-os') ||
    pathname.startsWith('/m/rider')
  );
}

export function riderOsTabActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
