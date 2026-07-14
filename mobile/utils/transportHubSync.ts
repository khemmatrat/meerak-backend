import type { Location, TransportHubSavedState, UserProfile } from "../types";
import type { RecentSearchEntry, SavedSpot, SavedTransportPlaces } from "./transportBangkokPlaces";
import { loadSavedTransportPlaces, persistFullSavedTransportPlaces } from "./transportBangkokPlaces";
import type { TransportRegionId } from "./transportRegions";

const MAX_RECENT = 14;

function spotFromServer(s: { lat: number; lng: number; label: string; updatedAt?: number }): SavedSpot {
  return {
    lat: s.lat,
    lng: s.lng,
    label: s.label,
    updatedAt: s.updatedAt ?? Date.now(),
  };
}

function mergeRecentLists(a: RecentSearchEntry[], b: RecentSearchEntry[]): RecentSearchEntry[] {
  const key = (x: RecentSearchEntry) => `${x.label}|${x.lat.toFixed(4)}|${x.lng.toFixed(4)}`;
  const seen = new Set<string>();
  const out: RecentSearchEntry[] = [];
  for (const x of [...b, ...a]) {
    const k = key(x);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out.slice(0, MAX_RECENT);
}

function mergeFavorites(a: SavedSpot[], b: SavedSpot[]): SavedSpot[] {
  const key = (x: SavedSpot) => `${x.lat.toFixed(5)}_${x.lng.toFixed(5)}`;
  const seen = new Set<string>();
  const out: SavedSpot[] = [];
  for (const x of [...b, ...a]) {
    const k = key(x);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out.slice(0, 12);
}

/**
 * Merge server `location.transport_hub` with local snapshot; persist to localStorage.
 */
export function mergeTransportHubFromProfile(user: UserProfile | null): SavedTransportPlaces {
  const local = loadSavedTransportPlaces();
  const th = user?.location?.transport_hub as TransportHubSavedState | undefined;
  if (!th) {
    persistFullSavedTransportPlaces(local);
    return local;
  }
  const merged: SavedTransportPlaces = {
    home: th.home ? spotFromServer(th.home) : local.home,
    office: th.office ? spotFromServer(th.office) : local.office,
    favorites: mergeFavorites(local.favorites, (th.favorites || []).map(spotFromServer)),
    recent: mergeRecentLists(local.recent, th.recent || []),
  };
  persistFullSavedTransportPlaces(merged);
  return merged;
}

export function buildLocationPatchForTransport(
  current: Location | undefined,
  prefs: SavedTransportPlaces,
  transportRegion?: TransportRegionId
): Location {
  const base: Location =
    current?.lat != null && current?.lng != null ? { ...current } : { lat: 13.7563, lng: 100.5018 };
  const transport_hub: TransportHubSavedState = {
    home: prefs.home,
    office: prefs.office,
    favorites: prefs.favorites,
    recent: prefs.recent,
  };
  return {
    ...base,
    ...(transportRegion ? { transport_region: transportRegion } : {}),
    transport_hub,
  };
}
