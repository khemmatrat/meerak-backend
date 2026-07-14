export async function reorderOrder(orderId: string, buyerId: string) {
  const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ buyer_id: buyerId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'สั่งซ้ำไม่สำเร็จ');
  return data as {
    ok: boolean;
    items: Array<{ product_id: string; title: string; qty: number; unit_price_micro: number }>;
    merchant_id?: string;
    redirect: string;
    order_type: string;
  };
}

export function receiptPdfUrl(orderId: string, buyerId: string) {
  return `/api/orders/${encodeURIComponent(orderId)}/receipt.pdf?buyer_id=${encodeURIComponent(buyerId)}`;
}

export async function fetchRiderEarnings(riderId: string, userId?: string) {
  const q = new URLSearchParams({ rider_id: riderId });
  if (userId) q.set('user_id', userId);
  const res = await fetch(`/api/rider/earnings?${q}`, { cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'โหลดรายได้ไม่สำเร็จ');
  return data;
}

export async function requestRiderWithdraw(riderId: string, amountMicro?: number) {
  const res = await fetch('/api/rider/withdraw', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rider_id: riderId, amount_micro: amountMicro || 0 }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'ขอถอนไม่สำเร็จ');
  return data;
}
