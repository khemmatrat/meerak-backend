/**
 * Kong v2 endpoint map — mobile shell → Cloud 3 (Architecture Bible diagram).
 * Legacy stays on /api/* (Cloud 2). v2 merchant/food/rider on /api/v2/*.
 */

export const V2_KONG_MAP = {
  /** BFF home, cart, checkout, orders, wallet, account */
  merchantBff: '/api/v2/merchant/v1',
  /** Food nearby, menu, cart */
  merchantFood: '/api/v2/merchant/food/v1/food',
  /** Merchant ops dashboard */
  merchantOps: '/api/v2/merchant/ops/v1',
  /** Dispatch / rider jobs */
  riderMerch: '/api/v2/rider-merch/v1/dispatch',
  /** Legacy (Cloud 2) — auth, jobs, wallet, profile */
  legacy: '/api',
} as const;

/** Storefront embed paths opened from mobile /storefront?p= */
export const MOBILE_EMBED_PATHS = {
  food: '/m/food',
  home: '/m/home',
  merchantOrders: '/m/merchant/orders',
  merchantShops: '/m/merchant/shops',
  riderJobs: '/m/rider/jobs',
  riderSetup: '/m/rider/signup',
  sell: '/m/sell',
  account: '/m/account',
} as const;

/** What stays on legacy /api (do NOT migrate to v2 yet) */
export const LEGACY_ONLY_PREFIXES = [
  '/provider/',
  '/bookings/',
  '/courses/',
  '/ads/',
  '/jobs/',
  '/notifications/',
] as const;
