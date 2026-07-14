import type { RiderTrackingView } from '@/lib/server/riderTracking';

export async function startFoodRiderTracking(body: {
  order_id: string;
  buyer_id: string;
  merchant_id: string;
  merchant_name: string;
  items_summary: string;
  address: string;
  handoff_note?: string;
  eta_label: string;
  payment_method?: string;
  amount_micro?: number;
  order_items?: Array<{
    item_id: string;
    title: string;
    qty: number;
    unit_price_micro: number;
    image_url?: string;
  }>;
}) {
  const res = await fetch('/api/food/tracking/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('tracking_start_failed');
  return res.json() as Promise<RiderTrackingView>;
}

export async function fetchRiderTracking(orderId: string) {
  const res = await fetch(`/api/food/tracking/${encodeURIComponent(orderId)}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('tracking_not_found');
  return res.json() as Promise<RiderTrackingView>;
}

export async function submitRiderReview(
  orderId: string,
  body: { stars: number; comment?: string; tip_micro?: number },
) {
  const res = await fetch(`/api/food/tracking/${encodeURIComponent(orderId)}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('review_failed');
  return res.json() as Promise<RiderTrackingView>;
}

export async function submitRiderReport(
  orderId: string,
  body: { type: string; note?: string },
) {
  const res = await fetch(`/api/food/tracking/${encodeURIComponent(orderId)}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('report_failed');
  return res.json() as Promise<RiderTrackingView>;
}

export async function sendRiderChat(orderId: string, text: string) {
  const res = await fetch(`/api/food/tracking/${encodeURIComponent(orderId)}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error('chat_failed');
  return res.json() as Promise<RiderTrackingView>;
}

export function mapPointToPercent(
  point: { lat: number; lng: number },
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number },
) {
  const coords = mapPointToCoords(point, bounds);
  return { left: `${coords.x}%`, top: `${coords.y}%` };
}

/** 0–100 coords for SVG map (same bounds as mapPointToPercent). */
export function mapPointToCoords(
  point: { lat: number; lng: number },
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number },
) {
  const x = ((point.lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 100;
  const y = ((bounds.maxLat - point.lat) / (bounds.maxLat - bounds.minLat)) * 100;
  return {
    x: Math.min(92, Math.max(8, x)),
    y: Math.min(88, Math.max(12, y)),
  };
}

export function routeCurvePath(
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const cx = (from.x + to.x) / 2;
  const cy = Math.min(from.y, to.y) - Math.max(8, Math.abs(from.x - to.x) * 0.15);
  return `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`;
}
