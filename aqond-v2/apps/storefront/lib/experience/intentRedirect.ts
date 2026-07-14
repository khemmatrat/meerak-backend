/** Map primary interest id → storefront route (mirrors backend resolveIntentRedirect) */

const ROUTES: Record<string, string> = {
  food_merchant: '/m/merchant/shops',
  marketplace_seller: '/m/merchant/shops',
  store: '/m/sell',
  food_order: '/m/food',
  rider: '/m/rider/signup',
  marketplace: '/m/home',
  talent: '/m/services/booking',
  services: '/m/services',
  hire: '/m/services',
  videos: '/m/feed',
  feeds: '/m/feed',
  courses: '/m/pro',
  ai_ads: '/m/merchant/ad-studio',
  product_images: '/m/studio',
  resume: '/m/services/create',
  travel: '/m/services',
  customer: '/m/home',
  other: '/m/home',
};

export function resolveIntentRedirect(primary?: string | null, fallback = '/m/home'): string {
  const key = String(primary || '').toLowerCase();
  for (const [needle, href] of Object.entries(ROUTES)) {
    if (key.includes(needle)) return href;
  }
  return fallback;
}
