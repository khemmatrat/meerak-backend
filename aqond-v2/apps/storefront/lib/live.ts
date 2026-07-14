/** Live commerce client helpers */
export type LivePinned = {
  f_code: string;
  slot: number;
  product_id: string;
  title: string;
  price_micro: number;
  image_url?: string;
  inventory?: number;
};

export type LiveChatMessage = {
  id?: string;
  kind: string;
  body: string;
  user_name?: string;
  user_id?: string;
  payload?: Record<string, unknown>;
  created_at?: string;
};

export async function fetchLivePinned(roomId: string) {
  const res = await fetch(`/api/live-commerce/v1/live/pinned?room_id=${encodeURIComponent(roomId)}`, {
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'โหลดสินค้าไลฟ์ไม่สำเร็จ');
  return (data.pinned || []) as LivePinned[];
}

export async function fetchLiveChatHistory(roomId: string) {
  const res = await fetch(`/api/live-commerce/v1/live/chat/history?room_id=${encodeURIComponent(roomId)}`, {
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return [] as LiveChatMessage[];
  return (data.messages || []) as LiveChatMessage[];
}

export function liveWsUrl(roomId: string, userId: string, userName: string) {
  const base = process.env.NEXT_PUBLIC_KONG_WS_URL
    || (typeof window !== 'undefined'
      ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:8000`
      : 'ws://127.0.0.1:8000');
  const q = new URLSearchParams({ room_id: roomId, user_id: userId, user_name: userName });
  return `${base}/api/v1/live-commerce/ws?${q}`;
}

export async function confirmLiveOrder(draftId: string, buyerId: string, qty = 1) {
  const res = await fetch('/api/live/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'confirm', draft_id: draftId, buyer_id: buyerId, qty }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.detail || 'สั่งจากไลฟ์ไม่สำเร็จ');
  return data;
}

export async function submitLiveAddress(input: {
  order_id: string;
  buyer_id: string;
  address_id?: string;
  parse_text?: string;
}) {
  const res = await fetch('/api/live/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'address', ...input }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'บันทึกที่อยู่ไม่สำเร็จ');
  return data;
}
