/**
 * Transport Hub job contract (P0: persisted with job; pricing engine uses later).
 * @see helper-docs/design-transport-intercity-and-relay.md (if present)
 */

import type { TransportRegionId } from "../utils/transportRegions";

export type TransportJobKind = "local_on_demand" | "intercity_charter" | "relay_leg";

export type TransportContractLatLng = {
  lat: number;
  lng: number;
  label?: string;
};

export type TransportRelayComfortTier = "indoor_ac" | "outdoor" | "unspecified";

/** Optional relay handoff (phase 2+ UI) */
export type TransportRelayPayload = {
  mode: "handoff_poi";
  poi: { id: string; label: string; lat: number; lng: number };
  comfort_tier?: TransportRelayComfortTier;
} | null;

export type TransportIntercityCharterPayload = {
  quote_breakdown?: {
    labor_thb?: number;
    vehicle_hire_thb?: number;
    tolls_estimate_thb?: number;
  };
  route_note?: string;
} | null;

/** Relay leg — next handoff point id (server metadata). */
export type TransportRelayDetails = {
  next_relay_point_id: string;
} | null;

export type TransportContract = {
  job_kind: TransportJobKind;
  service_region_id: TransportRegionId;
  pickup: TransportContractLatLng;
  dropoff: TransportContractLatLng;
  cross_region: boolean;
  distance_km: number;
  pricing_version: string;
  relay?: TransportRelayPayload;
  relay_details?: TransportRelayDetails;
  intercity_charter?: TransportIntercityCharterPayload;
};

/** Current Transport Hub flow — on-demand trip with optional cross-hub flag. */
export function buildLocalOnDemandTransportContract(args: {
  serviceRegion: TransportRegionId;
  pickup: [number, number];
  dropoff: [number, number];
  destinationLabel: string;
  crossRegion: boolean;
  distanceKm: number;
}): TransportContract {
  return {
    job_kind: "local_on_demand",
    service_region_id: args.serviceRegion,
    pickup: { lat: args.pickup[0], lng: args.pickup[1] },
    dropoff: {
      lat: args.dropoff[0],
      lng: args.dropoff[1],
      label: args.destinationLabel,
    },
    cross_region: args.crossRegion,
    distance_km: args.distanceKm,
    pricing_version: "client_v1",
    relay: null,
    relay_details: null,
    intercity_charter: null,
  };
}

/** Transport Hub — local vs intercity charter (pricing still legacy until backend flag on). */
export function buildTransportHubTransportContract(args: {
  jobKind: "local_on_demand" | "intercity_charter";
  serviceRegion: TransportRegionId;
  pickup: [number, number];
  dropoff: [number, number];
  destinationLabel: string;
  crossRegion: boolean;
  distanceKm: number;
  /** Snapshot for DB / audit (intercity only) */
  clientEstimateJobFeeThb: number;
}): TransportContract {
  const base = buildLocalOnDemandTransportContract({
    serviceRegion: args.serviceRegion,
    pickup: args.pickup,
    dropoff: args.dropoff,
    destinationLabel: args.destinationLabel,
    crossRegion: args.crossRegion,
    distanceKm: args.distanceKm,
  });
  if (args.jobKind === "local_on_demand") return base;
  return {
    ...base,
    job_kind: "intercity_charter",
    intercity_charter: {
      quote_breakdown: {
        labor_thb: Math.round(args.clientEstimateJobFeeThb * 100) / 100,
        vehicle_hire_thb: 0,
        tolls_estimate_thb: 0,
      },
    },
  };
}
