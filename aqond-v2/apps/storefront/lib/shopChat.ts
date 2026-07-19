export function shopChatHref(
  shopId: string,
  opts?: { orderId?: string; embed?: boolean },
): string {
  const q = new URLSearchParams();
  if (opts?.orderId) q.set('order_id', opts.orderId);
  if (opts?.embed) q.set('embed', '1');
  const qs = q.toString();
  return `/m/chat/${encodeURIComponent(shopId)}${qs ? `?${qs}` : ''}`;
}

/** Thread buyer_id for a rider in shop-chat store (`rider:{id}`). */
export function riderBuyerId(riderId: string): string {
  const raw = String(riderId || '').trim();
  return raw.startsWith('rider:') ? raw : `rider:${raw}`;
}

export function riderIdFromBuyerId(buyerId: string): string {
  return buyerId.startsWith('rider:') ? buyerId.slice('rider:'.length) : buyerId;
}

export function riderPeerLabel(buyerId: string): string {
  if (!buyerId.startsWith('rider:')) return buyerId.slice(0, 12);
  const id = riderIdFromBuyerId(buyerId);
  return `ไรเดอร์ · ${id.slice(0, 8)}`;
}

/** Merchant inbox — full-page chat with a rider thread. */
export function merchantRiderChatHref(
  merchantId: string,
  buyerId: string,
  opts?: { orderId?: string; embed?: boolean },
): string {
  const q = new URLSearchParams();
  if (merchantId) q.set('shop_id', merchantId);
  if (opts?.orderId) q.set('order_id', opts.orderId);
  if (opts?.embed) q.set('embed', '1');
  const qs = q.toString();
  const peer = buyerId.startsWith('rider:') ? buyerId : riderBuyerId(buyerId);
  return `/m/merchant/chat/${encodeURIComponent(peer)}${qs ? `?${qs}` : ''}`;
}

/** Rider OS — expand overlay to full-page merchant chat. */
export function riderShopChatHref(
  shopId: string,
  riderId: string,
  opts?: { orderId?: string; reference?: string; embed?: boolean },
): string {
  const q = new URLSearchParams();
  q.set('shop_id', shopId);
  if (opts?.orderId) q.set('order_id', opts.orderId);
  if (opts?.reference) q.set('ref', opts.reference);
  if (opts?.embed) q.set('embed', '1');
  const buyer = riderBuyerId(riderId);
  return `/m/merchant/chat/${encodeURIComponent(buyer)}?${q.toString()}`;
}
