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

export async function confirmFoodDelivery(orderId: string, buyerId?: string) {
  const res = await fetch(`/api/food/tracking/${encodeURIComponent(orderId)}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buyerId ? { buyer_id: buyerId } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String(data.error || 'confirm_failed'));
  }
  return data as Promise<RiderTrackingView>;
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

export async function sendRiderChat(
  orderId: string,
  text: string,
  from: 'customer' | 'rider' = 'customer',
  image_url?: string,
) {
  const res = await fetch(`/api/food/tracking/${encodeURIComponent(orderId)}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, from, ...(image_url ? { image_url } : {}) }),
  });
  if (!res.ok) throw new Error('chat_failed');
  return res.json() as Promise<RiderTrackingView>;
}

const CHAT_IMAGE_MAX_BYTES = 720_000;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('อ่านรูปไม่สำเร็จ'));
    reader.readAsDataURL(file);
  });
}

function compressImageToDataUrl(file: File, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      const maxDim = 1280;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('ประมวลผลรูปไม่สำเร็จ'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      let quality = 0.88;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      while (dataUrl.length > maxBytes * 1.37 && quality > 0.35) {
        quality -= 0.08;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
      }
      if (dataUrl.length > maxBytes * 1.37) {
        reject(new Error('รูปใหญ่เกินไป — ลองถ่ายใหม่หรือลดความละเอียด'));
        return;
      }
      resolve(dataUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('อ่านรูปไม่สำเร็จ'));
    };
    img.src = url;
  });
}

/** Read image file as data URL for chat proof (auto-compress when large). */
export async function readChatImageFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('กรุณาเลือกรูปภาพ');
  }
  if (file.size <= CHAT_IMAGE_MAX_BYTES) {
    const raw = await readFileAsDataUrl(file);
    if (raw.length <= CHAT_IMAGE_MAX_BYTES * 1.37) return raw;
  }
  return compressImageToDataUrl(file, CHAT_IMAGE_MAX_BYTES);
}

/** Compress canvas snapshot for delivery/chat proof (camera-only flow). */
export function canvasToChatImageDataUrl(canvas: HTMLCanvasElement, maxBytes = CHAT_IMAGE_MAX_BYTES): string {
  let quality = 0.88;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  while (dataUrl.length > maxBytes * 1.37 && quality > 0.35) {
    quality -= 0.08;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }
  if (dataUrl.length > maxBytes * 1.37) {
    throw new Error('รูปใหญ่เกินไป — ลองถ่ายใหม่');
  }
  return dataUrl;
}

export async function ensureFoodRiderTracking(orderId: string, jobId?: string) {
  const res = await fetch('/api/food/tracking/ensure', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_id: orderId, job_id: jobId }),
  });
  if (!res.ok) throw new Error('tracking_ensure_failed');
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
