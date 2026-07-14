import type { FoodRestaurant } from './localFood';
import { estimateFoodEta } from './localFood';

export type DeliveryMode = 'express' | 'normal' | 'saver';

export type DeliveryModeInfo = {
  id: DeliveryMode;
  label: string;
  hint: string;
  eta_extra_min: number;
};

export const DELIVERY_MODES: DeliveryModeInfo[] = [
  { id: 'express', label: 'ส่งด่วน', hint: 'ราคาเต็ม · ถึงเร็วที่สุด', eta_extra_min: 0 },
  { id: 'normal', label: 'ส่งปกติ', hint: 'ถูกลง ~30% (เช่น ฿20 → ฿14)', eta_extra_min: 5 },
  { id: 'saver', label: 'ส่งประหยัด', hint: '฿8–12 · รวมออเดอร์ร้านใกล้กัน', eta_extra_min: 18 },
];

/** Rider fare model (satang/micro: 1 THB = 100 micro in catalog).
 *  Primary quote engine: food-svc (POST /v1/food/delivery/quote). This module is the local-dev fallback. */
export const RIDER_BASE_MICRO = 3500;
export const RIDER_PER_KM_MICRO = 900;

export type ShopDeliveryLine = {
  merchant_id: string;
  merchant_name: string;
  express_micro: number;
  charged_micro: number;
};

export type DeliveryQuote = {
  mode: DeliveryMode;
  total_micro: number;
  per_shop: ShopDeliveryLine[];
  shop_count: number;
  batch_eligible: boolean;
  batch_zone?: string;
  rider_estimate_micro: number;
  rider_hint: string;
  eta_extra_min: number;
  eta_label?: string;
};

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function maxSpreadKm(restaurants: FoodRestaurant[]) {
  let max = 0;
  for (let i = 0; i < restaurants.length; i += 1) {
    for (let j = i + 1; j < restaurants.length; j += 1) {
      const a = restaurants[i];
      const b = restaurants[j];
      if (a.lat != null && a.lng != null && b.lat != null && b.lng != null) {
        max = Math.max(max, haversineKm({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }));
      }
    }
  }
  return max;
}

export function canBatchRestaurants(restaurants: FoodRestaurant[]) {
  if (restaurants.length < 2) return false;
  const zones = [...new Set(restaurants.map((r) => r.zone_id).filter(Boolean))];
  if (zones.length === 1) return true;
  const spread = maxSpreadKm(restaurants);
  return spread > 0 && spread <= 3;
}

function normalFeeFromExpress(expressMicro: number) {
  return Math.max(1400, Math.round(expressMicro * 0.7));
}

function saverTotalMicro(restaurants: FoodRestaurant[]) {
  if (restaurants.length >= 2 && canBatchRestaurants(restaurants)) {
    const spread = maxSpreadKm(restaurants);
    if (spread <= 0.5) return 800;
    if (spread <= 1.5) return 1000;
    return 1200;
  }
  return 1000;
}

function riderEstimateMicro(restaurants: FoodRestaurant[]) {
  const avgDist =
    restaurants.reduce((s, r) => s + (r.distance_km || 1), 0) / Math.max(1, restaurants.length);
  const stops = Math.max(1, restaurants.length);
  const km = avgDist + (stops - 1) * 0.35;
  return RIDER_BASE_MICRO + Math.round(km * RIDER_PER_KM_MICRO);
}

export function quoteFoodDelivery(
  restaurants: FoodRestaurant[],
  mode: DeliveryMode = 'normal',
): DeliveryQuote {
  const batchEligible = restaurants.length >= 2 && canBatchRestaurants(restaurants);
  const zone = restaurants.map((r) => r.zone_id).find(Boolean);
  const modeInfo = DELIVERY_MODES.find((m) => m.id === mode) || DELIVERY_MODES[1];

  const perShop: ShopDeliveryLine[] = restaurants.map((r) => {
    const express = r.delivery_fee_micro || 2000;
    let charged = express;
    if (mode === 'normal') charged = normalFeeFromExpress(express);
    if (mode === 'saver') charged = 0;
    return {
      merchant_id: r.id,
      merchant_name: r.name,
      express_micro: express,
      charged_micro: charged,
    };
  });

  let total: number;
  if (mode === 'saver') {
    total = saverTotalMicro(restaurants);
    const each = Math.floor(total / Math.max(1, perShop.length));
    perShop.forEach((p, i) => {
      p.charged_micro = i === perShop.length - 1
        ? total - each * (perShop.length - 1)
        : each;
    });
  } else if (mode === 'normal') {
    total = perShop.reduce((s, p) => s + p.charged_micro, 0);
  } else {
    total = perShop.reduce((s, p) => s + p.express_micro, 0);
    perShop.forEach((p) => { p.charged_micro = p.express_micro; });
  }

  const riderEst = riderEstimateMicro(restaurants);
  const longest = restaurants.reduce(
    (best, r) => {
      const eta = estimateFoodEta(r);
      return eta.eta_max > (best?.eta_max || 0) ? eta : best;
    },
    null as ReturnType<typeof estimateFoodEta> | null,
  );

  const etaMin = (longest?.eta_min || 25) + modeInfo.eta_extra_min;
  const etaMax = (longest?.eta_max || 35) + modeInfo.eta_extra_min;

  return {
    mode,
    total_micro: total,
    per_shop: perShop,
    shop_count: restaurants.length,
    batch_eligible: batchEligible,
    batch_zone: zone,
    rider_estimate_micro: riderEst,
    rider_hint: batchEligible && mode === 'saver'
      ? `ไรเดอร์รับรวม ~${(riderEst / 100).toFixed(0)} บาท · หลายร้านละแวกเดียวกัน`
      : `ไรเดอร์ ~${(riderEst / 100).toFixed(0)} บาท (ฐาน 35 + กม.ละ 9)`,
    eta_extra_min: modeInfo.eta_extra_min,
    eta_label: `${etaMin}–${etaMax} นาที`,
  };
}
