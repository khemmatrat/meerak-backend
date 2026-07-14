/**
 * ราคาเดินรถตามระยะทาง (Transport Hub local on-demand) — GET /api/settings/pricing
 * แหล่งเดียวกับแอดมิน PATCH /api/admin/settings/pricing (system_settings key transport_distance_pricing)
 *
 * ค่า default ด้านล่างต้องคงสอดคล้องกับ backend/lib/distancePricing.js — DISTANCE_PRICING_DEFAULTS
 */
import { api } from "./api";
import type { TransportPricingFormula } from "../utils/transportIntercityQuote";

export const DISTANCE_PRICING_DEFAULTS = {
  base_fare_thb: 0,
  price_per_km_thb: 25,
  minimum_fare_thb: 100,
} as const;

/** เมื่อ GET /settings/pricing ล้มเหลว — ตรงกับค่าเริ่มต้นฝั่ง backend (getTransportMatchMarkupRate ไม่มี env) */
export const DEFAULT_TRANSPORT_MATCH_MARKUP_RATE = 0.05;

export type DistancePricingSettingsResponse = {
  base_fare_thb: number;
  price_per_km_thb: number;
  minimum_fare_thb: number;
  markup_rate?: number;
  markup_percent?: number;
  updated_at?: string | null;
};

/** GET /api/settings/transport-pricing — สูตรเหมาข้ามจังหวัด (admin แก้คนละ key) */
export type TransportIntercityPricingResponse = {
  intercity_pricing_globally_enabled?: boolean;
  formula?: TransportPricingFormula;
};

let cachedDistance: { data: DistancePricingSettingsResponse; at: number } | null = null;
let cachedIntercity: { data: TransportIntercityPricingResponse; at: number } | null = null;
const TTL_MS = 120_000;

export async function fetchDistancePricingSettings(options?: {
  force?: boolean;
}): Promise<DistancePricingSettingsResponse> {
  if (!options?.force && cachedDistance && Date.now() - cachedDistance.at < TTL_MS) {
    return cachedDistance.data;
  }
  const { data } = await api.get<DistancePricingSettingsResponse>("/settings/pricing");
  cachedDistance = { data, at: Date.now() };
  return data;
}

export async function fetchTransportIntercityPricing(options?: {
  force?: boolean;
}): Promise<TransportIntercityPricingResponse> {
  if (!options?.force && cachedIntercity && Date.now() - cachedIntercity.at < TTL_MS) {
    return cachedIntercity.data;
  }
  const { data } = await api.get<TransportIntercityPricingResponse>("/settings/transport-pricing");
  cachedIntercity = { data, at: Date.now() };
  return data;
}

export function clearTransportDistancePricingCaches() {
  cachedDistance = null;
  cachedIntercity = null;
}

/** หลัง GET /api/app/bootstrap — ให้ Transport Hub ใช้ราคาเดียวกับเซิร์ฟเวอร์โดยไม่ยิงซ้ำทันที */
export function seedDistancePricingCache(data: DistancePricingSettingsResponse) {
  cachedDistance = { data, at: Date.now() };
}
