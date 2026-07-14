export const MERCHANT_LABELS: Record<string, string> = {
  'demo-merchant': 'ร้านค้า Aqond Demo',
  'm-food-1': 'ร้านอาหารสุขภาพ',
  'm-fashion-1': 'Fashion Corner',
  'm-tech-1': 'Tech Gadget Store',
  'm-beauty-1': 'Beauty Lab',
  'm-sport-1': 'Sport Zone',
  'm-home-1': 'Home Living',
};

export function merchantDisplayName(id?: string, fallback?: string) {
  if (!id) return fallback || 'ร้านค้า';
  return MERCHANT_LABELS[id] || fallback || id;
}

export function groupCartByMerchant<T extends { merchant_id?: string; merchant_hint?: string }>(
  items: T[],
) {
  const groups = new Map<string, T[]>();
  for (const it of items) {
    const mid = (it as any).merchant_id || (it as any).merchant_hint || 'demo-merchant';
    const list = groups.get(mid) || [];
    list.push(it);
    groups.set(mid, list);
  }
  return [...groups.entries()].map(([merchant_id, groupItems]) => ({
    merchant_id,
    merchant_name: merchantDisplayName(merchant_id),
    items: groupItems,
  }));
}
