/**
 * OSRM public demo — ใช้ประมาณ ETA/ระยะทาง (ไม่ต้อง API key)
 * ถ้า CORS/เครือข่ายล้มเหลว ให้เรียก haversineEtaFallback แทน
 */

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
}

/** ประมาณเวลาเดินทางจากระยะเส้นตรง (km) — สมมติความเร็วเฉลี่ยในเมือง ~28 km/h */
export function straightLineEtaMinutes(distanceKm: number): number {
  const hours = distanceKm / 28;
  return Math.max(1, Math.round(hours * 60));
}

export async function fetchOsrmDrivingEta(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): Promise<{ durationMinutes: number; distanceKm: number } | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = (await r.json()) as {
      routes?: Array<{ duration?: number; distance?: number }>;
    };
    const route = j.routes?.[0];
    if (!route || route.duration == null || route.distance == null) return null;
    return {
      durationMinutes: route.duration / 60,
      distanceKm: route.distance / 1000,
    };
  } catch {
    return null;
  }
}

export async function getTravelEtaWithFallback(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): Promise<{ durationMinutes: number; distanceKm: number; source: "osrm" | "straight" }> {
  const osrm = await fetchOsrmDrivingEta(from, to);
  if (osrm) return { ...osrm, source: "osrm" };
  const d = haversineKm(from, to);
  return {
    durationMinutes: straightLineEtaMinutes(d),
    distanceKm: d,
    source: "straight",
  };
}

/**
 * Multi-stop driving route geometry (GeoJSON → Leaflet [lat, lng]).
 * Used for map polylines; may fail on CORS/network — caller should hide polyline only.
 */
export async function fetchOsrmDrivingRouteGeometry(
  waypoints: Array<{ lat: number; lng: number }>
): Promise<{ coordinates: [number, number][] } | null> {
  if (waypoints.length < 2) return null;
  try {
    const path = waypoints.map((w) => `${w.lng},${w.lat}`).join(";");
    const url = `https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = (await r.json()) as {
      routes?: Array<{ geometry?: { type?: string; coordinates?: [number, number][] } }>;
    };
    const coords = j.routes?.[0]?.geometry?.coordinates;
    if (!coords?.length) return null;
    const leaflet: [number, number][] = coords.map(([lng, lat]) => [lat, lng]);
    return { coordinates: leaflet };
  } catch {
    return null;
  }
}
