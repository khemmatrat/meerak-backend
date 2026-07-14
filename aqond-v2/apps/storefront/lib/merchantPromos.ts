export async function fetchMerchantPromotions(merchantId: string) {
  const res = await fetch(`/api/merchant/promotions?merchant_id=${encodeURIComponent(merchantId)}`, {
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'โหลดโปรไม่สำเร็จ');
  return data as { merchant_id: string; promotions: unknown[] };
}

export async function saveMerchantPromotion(input: {
  merchant_id: string;
  actor?: string;
  id?: string;
  kind: string;
  label: string;
  active?: boolean;
  discount_percent?: number;
  window_start?: string;
  window_end?: string;
  min_order_micro?: number;
  ends_at?: string;
}) {
  const res = await fetch('/api/merchant/promotions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'บันทึกโปรไม่สำเร็จ');
  return data;
}
