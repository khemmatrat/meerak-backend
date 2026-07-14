/**
 * Service regions for Transport Hub — map center, search bias (Nominatim viewbox), soft boundaries.
 * `INFER_ORDER`: smaller / more specific hubs first (e.g. Pattaya before Chon Buri).
 * Relay / handoff at malls & cafes: product backlog (comfortable AC wait points).
 */

export type TransportRegionId =
  | "bangkok"
  | "chiang_mai"
  | "phuket"
  | "pattaya"
  | "chonburi"
  | "ratchaburi"
  | "khon_kaen"
  | "korat"
  | "hat_yai"
  | "buriram"
  | "udon_thani";

/** Minimum linear base (job fee before vehicle multiplier) when pickup & dropoff fall in different hubs. */
export const CROSS_REGION_MIN_BASE_THB = 320;

export type TransportRegionDefinition = {
  id: TransportRegionId;
  /** [lat, lng] — city / district hub */
  center: [number, number];
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
};

/** Nominatim viewbox: left,top,right,bottom = minLon, maxLat, maxLon, minLat */
export function nominatimViewboxParam(r: TransportRegionDefinition): string {
  return `${r.minLon},${r.maxLat},${r.maxLon},${r.minLat}`;
}

export const TRANSPORT_REGIONS: Record<TransportRegionId, TransportRegionDefinition> = {
  bangkok: {
    id: "bangkok",
    center: [13.7563, 100.5018],
    minLat: 13.45,
    maxLat: 14.05,
    minLon: 100.25,
    maxLon: 100.95,
  },
  chiang_mai: {
    id: "chiang_mai",
    center: [18.7883, 98.9853],
    minLat: 18.65,
    maxLat: 18.95,
    minLon: 98.85,
    maxLon: 99.15,
  },
  phuket: {
    id: "phuket",
    center: [7.8804, 98.3923],
    minLat: 7.55,
    maxLat: 8.25,
    minLon: 98.15,
    maxLon: 98.55,
  },
  pattaya: {
    id: "pattaya",
    center: [12.9236, 100.8825],
    minLat: 12.78,
    maxLat: 13.05,
    minLon: 100.78,
    maxLon: 101.05,
  },
  chonburi: {
    id: "chonburi",
    center: [13.3611, 100.9847],
    minLat: 13.05,
    maxLat: 13.55,
    minLon: 100.85,
    maxLon: 101.25,
  },
  ratchaburi: {
    id: "ratchaburi",
    center: [13.5283, 99.8134],
    minLat: 13.35,
    maxLat: 13.65,
    minLon: 99.65,
    maxLon: 100.05,
  },
  khon_kaen: {
    id: "khon_kaen",
    center: [16.4322, 102.8236],
    minLat: 16.35,
    maxLat: 16.55,
    minLon: 102.65,
    maxLon: 103.05,
  },
  korat: {
    id: "korat",
    center: [14.9799, 102.0977],
    minLat: 14.85,
    maxLat: 15.15,
    minLon: 101.9,
    maxLon: 102.35,
  },
  /** หาดใหญ่ / สงขลา ฝั่งเมือง */
  hat_yai: {
    id: "hat_yai",
    center: [7.0086, 100.4747],
    minLat: 6.92,
    maxLat: 7.14,
    minLon: 100.32,
    maxLon: 100.58,
  },
  buriram: {
    id: "buriram",
    center: [14.993, 103.1029],
    minLat: 14.85,
    maxLat: 15.15,
    minLon: 102.95,
    maxLon: 103.35,
  },
  udon_thani: {
    id: "udon_thani",
    center: [17.4157, 102.7859],
    minLat: 17.32,
    maxLat: 17.52,
    minLon: 102.65,
    maxLon: 102.95,
  },
};

/** Inference order: specific hubs before broad ones */
const INFER_ORDER: TransportRegionId[] = [
  "pattaya",
  "phuket",
  "hat_yai",
  "chiang_mai",
  "ratchaburi",
  "buriram",
  "khon_kaen",
  "korat",
  "udon_thani",
  "chonburi",
  "bangkok",
];

export const ALL_TRANSPORT_REGION_IDS = Object.keys(TRANSPORT_REGIONS) as TransportRegionId[];

export function pointInRegion(lat: number, lng: number, r: TransportRegionDefinition): boolean {
  return lat >= r.minLat && lat <= r.maxLat && lng >= r.minLon && lng <= r.maxLon;
}

export function inferRegionFromCoords(lat: number, lng: number): TransportRegionId | null {
  for (const id of INFER_ORDER) {
    const r = TRANSPORT_REGIONS[id];
    if (pointInRegion(lat, lng, r)) return id;
  }
  return null;
}

export function getRegionOrDefault(id: string | undefined | null): TransportRegionDefinition {
  if (id && id in TRANSPORT_REGIONS) {
    return TRANSPORT_REGIONS[id as TransportRegionId];
  }
  return TRANSPORT_REGIONS.bangkok;
}

export type RegionPair = { pickup: TransportRegionId; dropoff: TransportRegionId };

/** Nearest hub when coords are outside all boxes */
export function nearestRegionId(lat: number, lng: number): TransportRegionId {
  let best: TransportRegionId = "bangkok";
  let bestD = Infinity;
  for (const id of ALL_TRANSPORT_REGION_IDS) {
    const c = TRANSPORT_REGIONS[id].center;
    const d = (c[0] - lat) ** 2 + (c[1] - lng) ** 2;
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

export function isCrossRegionTrip(
  pickup: [number, number],
  dropoff: [number, number]
): RegionPair | null {
  const [plat, plng] = pickup;
  const [dlat, dlng] = dropoff;
  const p = inferRegionFromCoords(plat, plng) ?? nearestRegionId(plat, plng);
  const d = inferRegionFromCoords(dlat, dlng) ?? nearestRegionId(dlat, dlng);
  if (p !== d) return { pickup: p, dropoff: d };
  return null;
}
