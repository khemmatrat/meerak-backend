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
