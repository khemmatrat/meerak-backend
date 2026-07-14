export function shopDeepLink(merchantId: string, isFood: boolean, origin?: string) {
  const base = origin || (typeof window !== 'undefined' ? window.location.origin : '');
  if (isFood) return `${base}/m/food/${encodeURIComponent(merchantId)}`;
  return `${base}/m/home?merchant=${encodeURIComponent(merchantId)}`;
}

export function shopQrImageUrl(deepLink: string, size = 240) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(deepLink)}`;
}
