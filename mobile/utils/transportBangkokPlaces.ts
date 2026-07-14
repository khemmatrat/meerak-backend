/**
 * Transport Hub — saved places, search, geocoding (Nominatim).
 * Popular POIs live in `transportPopularPois.ts`; regions in `transportRegions.ts`.
 */

import type { TransportRegionId } from "./transportRegions";
import { getRegionOrDefault, nominatimViewboxParam } from "./transportRegions";
import { type TransportPoi, getPopularPlacesForRegion } from "./transportPopularPois";

export type { TransportPoi };
export { BANGKOK_POPULAR_PLACES, getPoiById, getCentralLandmarkPoi } from "./transportPopularPois";

const STORAGE_KEY = "aqond_transport_saved_places_v1";

export type SavedSpot = { lat: number; lng: number; label: string; updatedAt: number };

export type RecentSearchEntry = { label: string; lat: number; lng: number; at: number };

export type SavedTransportPlaces = {
  home: SavedSpot | null;
  office: SavedSpot | null;
  /** User-pinned favorites (max kept client-side) */
  favorites: SavedSpot[];
  /** Last successful searches / picks */
  recent: RecentSearchEntry[];
};

const MAX_FAVORITES = 12;
const MAX_RECENT = 14;

export function loadSavedTransportPlaces(): SavedTransportPlaces {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { home: null, office: null, favorites: [], recent: [] };
    const p = JSON.parse(raw) as Partial<SavedTransportPlaces>;
    return {
      home: p.home && typeof p.home.lat === "number" ? p.home : null,
      office: p.office && typeof p.office.lat === "number" ? p.office : null,
      favorites: Array.isArray(p.favorites) ? p.favorites.filter((x) => typeof x?.lat === "number") : [],
      recent: Array.isArray(p.recent) ? p.recent.filter((x) => typeof x?.lat === "number") : [],
    };
  } catch {
    return { home: null, office: null, favorites: [], recent: [] };
  }
}

function persist(data: SavedTransportPlaces) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* quota */
  }
}

/** Replace full snapshot (e.g. after merge from profile). */
export function persistFullSavedTransportPlaces(data: SavedTransportPlaces) {
  persist(data);
}

export function saveTransportHome(spot: Omit<SavedSpot, "updatedAt">) {
  const cur = loadSavedTransportPlaces();
  cur.home = { ...spot, updatedAt: Date.now() };
  persist(cur);
}

export function saveTransportOffice(spot: Omit<SavedSpot, "updatedAt">) {
  const cur = loadSavedTransportPlaces();
  cur.office = { ...spot, updatedAt: Date.now() };
  persist(cur);
}

export function addTransportFavorite(spot: Omit<SavedSpot, "updatedAt">) {
  const cur = loadSavedTransportPlaces();
  const entry: SavedSpot = { ...spot, updatedAt: Date.now() };
  const rest = cur.favorites.filter(
    (f) => Math.abs(f.lat - entry.lat) > 1e-5 || Math.abs(f.lng - entry.lng) > 1e-5
  );
  cur.favorites = [entry, ...rest].slice(0, MAX_FAVORITES);
  persist(cur);
}

export function addRecentSearch(entry: Omit<RecentSearchEntry, "at">) {
  const cur = loadSavedTransportPlaces();
  const at = Date.now();
  const rest = cur.recent.filter(
    (r) =>
      Math.abs(r.lat - entry.lat) > 2e-4 ||
      Math.abs(r.lng - entry.lng) > 2e-4 ||
      r.label !== entry.label
  );
  cur.recent = [{ ...entry, at }, ...rest].slice(0, MAX_RECENT);
  persist(cur);
}

/** Haversine distance in km */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
}

export function sortPoisByDistanceFrom(
  pickup: { lat: number; lng: number },
  pois: TransportPoi[]
): TransportPoi[] {
  return [...pois].sort(
    (a, b) => haversineKm(pickup, a) - haversineKm(pickup, b)
  );
}

/** Short label from Nominatim reverse (free). */
export async function reverseGeocodeShort(lat: number, lng: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=0`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "th,en",
        "User-Agent": "AQOND-Mobile/1.0 (https://aqond.com; transport booking)",
      },
    });
    if (!res.ok) return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    const data = (await res.json()) as { display_name?: string };
    const name = data.display_name || "";
    return name.split(",").slice(0, 3).join(",").trim() || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function scoreMatch(query: string, poi: TransportPoi): number {
  const q = normalize(query);
  if (!q) return 0;
  const label = normalize(poi.label);
  let score = 0;
  if (label.includes(q)) score += 80;
  if (q.length >= 2) {
    for (const k of poi.keywords) {
      const nk = normalize(k);
      if (nk.includes(q) || q.includes(nk)) score += 45;
    }
    const parts = q.split(/\s+/).filter((x) => x.length > 1);
    for (const part of parts) {
      if (label.includes(part)) score += 25;
      if (poi.keywords.some((k) => normalize(k).includes(part))) score += 20;
    }
  }
  return score;
}

export function filterPopularPlaces(
  query: string,
  limit = 12,
  pickup?: { lat: number; lng: number },
  regionId: TransportRegionId = "bangkok"
): TransportPoi[] {
  const pool = getPopularPlacesForRegion(regionId);
  const q = query.trim();
  if (!q) {
    const base = pickup ? sortPoisByDistanceFrom(pickup, [...pool]) : [...pool];
    return base.slice(0, limit);
  }
  const scored = pool
    .map((p) => ({ p, s: scoreMatch(q, p) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => {
      if (b.s !== a.s) return b.s - a.s;
      if (pickup) return haversineKm(pickup, a.p) - haversineKm(pickup, b.p);
      return 0;
    });
  if (scored.length === 0) {
    const loose = pool.filter((p) => scoreMatch(q, p) > 0);
    const sorted = pickup ? sortPoisByDistanceFrom(pickup, loose) : loose;
    return sorted.slice(0, limit);
  }
  return scored.map((x) => x.p).slice(0, limit);
}

export type ResolvedDestination = { lat: number; lng: number; label: string; source: "poi" | "saved" | "nominatim" };

/**
 * Resolve typed search to coordinates: saved + local POIs first, then Nominatim (Thailand).
 */
export async function resolveTransportDestination(
  rawQuery: string,
  regionId: TransportRegionId = "bangkok"
): Promise<ResolvedDestination | null> {
  const query = rawQuery.trim();
  if (!query) return null;

  const saved = loadSavedTransportPlaces();
  const savedList: { label: string; lat: number; lng: number; source: "saved" }[] = [];
  if (saved.home) savedList.push({ ...saved.home, source: "saved" });
  if (saved.office) savedList.push({ ...saved.office, source: "saved" });
  for (const f of saved.favorites) {
    savedList.push({ label: f.label, lat: f.lat, lng: f.lng, source: "saved" });
  }

  const qn = normalize(query);
  let best: { lat: number; lng: number; label: string; score: number; source: "poi" | "saved" } | null = null;

  for (const s of savedList) {
    const sc = normalize(s.label).includes(qn) || qn.length >= 2 && normalize(s.label).split(/\s/).some((w) => w.startsWith(qn))
      ? 70
      : 0;
    if (sc > 0 && (!best || sc > best.score)) {
      best = { lat: s.lat, lng: s.lng, label: s.label, score: sc, source: "saved" };
    }
  }

  const regionalPool = getPopularPlacesForRegion(regionId);
  for (const poi of regionalPool) {
    const sc = scoreMatch(query, poi);
    if (sc > 0 && (!best || sc > best.score)) {
      best = { lat: poi.lat, lng: poi.lng, label: poi.label, score: sc, source: "poi" };
    }
  }

  if (best && best.score >= 25) {
    return { lat: best.lat, lng: best.lng, label: best.label, source: best.source };
  }

  try {
    const r = getRegionOrDefault(regionId);
    const vb = nominatimViewboxParam(r);
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=th&addressdetails=0&viewbox=${encodeURIComponent(
      vb
    )}&bounded=1&q=${encodeURIComponent(`${query}, Thailand`)}`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "th,en",
        "User-Agent": "AQOND-Mobile/1.0 (https://aqond.com; transport booking)",
      },
    });
    if (!res.ok) return best ? { lat: best.lat, lng: best.lng, label: best.label, source: best.source } : null;
    let data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    let hit = data?.[0];
    if (!hit?.lat || !hit?.lon) {
      const urlWide = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=th&addressdetails=0&q=${encodeURIComponent(
        `${query}, Thailand`
      )}`;
      const res2 = await fetch(urlWide, {
        headers: {
          Accept: "application/json",
          "Accept-Language": "th,en",
          "User-Agent": "AQOND-Mobile/1.0 (https://aqond.com; transport booking)",
        },
      });
      if (res2.ok) {
        data = (await res2.json()) as Array<{ lat: string; lon: string; display_name: string }>;
        hit = data?.[0];
      }
    }
    if (hit?.lat && hit?.lon) {
      const lat = parseFloat(hit.lat);
      const lng = parseFloat(hit.lon);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        const shortLabel = hit.display_name.split(",").slice(0, 3).join(",").trim();
        return { lat, lng, label: shortLabel || query, source: "nominatim" };
      }
    }
  } catch {
    /* offline / CORS / rate limit */
  }

  if (best) {
    return { lat: best.lat, lng: best.lng, label: best.label, source: best.source };
  }
  return null;
}
