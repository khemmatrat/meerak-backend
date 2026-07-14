/**
 * OSRM public demo — no API key. For production, self-host or use a paid router with SLA.
 * https://project-osrm.org/
 */

const DEFAULT_OSRM =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_OSRM_BASE_URL
    ? String(import.meta.env.VITE_OSRM_BASE_URL).replace(/\/$/, "")
    : "https://router.project-osrm.org";

export type OsrmRouteResult = {
  distanceKm: number;
  durationMin: number;
  /** [lat, lng][] for Leaflet */
  coordinates: [number, number][];
};

/**
 * Driving route (lon,lat order in URL per OSRM).
 */
export async function fetchOsrmDrivingRoute(
  pickup: [number, number],
  dropoff: [number, number],
  baseUrl = DEFAULT_OSRM
): Promise<OsrmRouteResult | null> {
  const [lat1, lon1] = pickup;
  const [lat2, lon2] = dropoff;
  const url = `${baseUrl}/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      routes?: Array<{ distance?: number; duration?: number; geometry?: { coordinates?: [number, number][] } }>;
    };
    const route = data.routes?.[0];
    if (!route) return null;
    const raw = route.geometry?.coordinates;
    const coordinates: [number, number][] = Array.isArray(raw)
      ? raw.map(([lng, lat]) => [lat, lng] as [number, number])
      : [];
    return {
      distanceKm: (route.distance ?? 0) / 1000,
      durationMin: (route.duration ?? 0) / 60,
      coordinates: coordinates.length >= 2 ? coordinates : [],
    };
  } catch {
    return null;
  }
}
