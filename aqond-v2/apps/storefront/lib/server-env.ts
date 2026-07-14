/** Server-only helpers for Next.js API routes (never import in client components). */

export function kongBase(): string {
  return (process.env.KONG_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
}

export function aiCoreKey(): string {
  return process.env.AI_CORE_API_KEY || '';
}

export function catalogApi(path: string): string {
  return `${kongBase()}/api/v1/catalog${path}`;
}

/** Catalog writes — prefer direct URL in dev to skip Kong JWT when set. */
export function catalogWriteApi(path: string): string {
  const direct = process.env.CATALOG_DIRECT_URL || process.env.CATALOG_SERVICE_URL;
  if (direct && !direct.includes('catalog-svc:')) {
    return `${direct.replace(/\/$/, '')}${path}`;
  }
  return catalogApi(path);
}

export function bffApi(path: string): string {
  return `${kongBase()}/api/v1/bff${path}`;
}

export function guardianApi(path: string): string {
  const direct = process.env.GUARDIAN_API_URL || process.env.AGK_API_URL;
  if (direct) {
    return `${direct.replace(/\/$/, '')}${path}`;
  }
  return `${kongBase()}/api/v1/guardian${path}`;
}

/** Phase 1.1 — AGK observe tap enabled when AGK_OBSERVE=on|1|true */
export function isAgkObserveEnabled(): boolean {
  const v = (process.env.AGK_OBSERVE || '').toLowerCase();
  return v === '1' || v === 'true' || v === 'on';
}

/** Phase 1.2 — shadow firewall (alert only). */
export function isAgkFirewallShadow(): boolean {
  const v = (process.env.AGK_FIREWALL || '').toLowerCase();
  return v === 'shadow' || v === 'on' || v === '1' || v === 'true';
}

/** Phase 1.3 — hard policy enforce when AGK_POLICY=on */
export function isAgkPolicyEnforce(): boolean {
  const v = (process.env.AGK_POLICY || '').toLowerCase();
  return v === 'on' || v === 'enforce' || v === '1' || v === 'true';
}

export function aiCoreApi(path: string): string {
  const direct = process.env.AI_CORE_DIRECT_URL || process.env.AI_CORE_URL;
  if (direct && !direct.includes('ai-core:')) {
    return `${direct.replace(/\/$/, '')}${path}`;
  }
  return `${kongBase()}/api/v1/ai${path}`;
}

export function hermesApi(path: string): string {
  return `${kongBase()}/api/v1/hermes${path}`;
}

export function recsysApi(path: string): string {
  return `${kongBase()}/api/v1/recsys${path}`;
}

export function searchApi(path: string): string {
  return `${kongBase()}/api/v1/search${path}`;
}

export function foodApi(path: string): string {
  return `${kongBase()}/api/v1/food${path}`;
}

export function notifyApi(path: string): string {
  return `${kongBase()}/api/v1/notify${path}`;
}

export function complianceApi(path: string): string {
  return `${kongBase()}/api/v1/returns${path}`;
}

export function couponApi(path: string): string {
  return `${kongBase()}/api/v1/coupons${path}`;
}

export function dispatchApi(path: string): string {
  return `${kongBase()}/api/v1/dispatch${path}`;
}

/** Bible Phase 5 — optional v2 public alias prefix (default keeps /api/v1). */
export function apiV2Prefix(): string {
  const p = process.env.NEXT_PUBLIC_API_V2_PREFIX || '/api/v1';
  return p.replace(/\/$/, '');
}

export function dispatchTrackWsUrl(orderId: string): string {
  const base = kongBase().replace(/^http/, 'ws').replace(/\/$/, '');
  const prefix = apiV2Prefix();
  if (prefix.startsWith('/api/v2')) {
    return `${base}/api/v2/rider-merch/v1/dispatch/ws/track?order_id=${encodeURIComponent(orderId)}`;
  }
  return `${base}/api/v1/dispatch/v1/dispatch/ws/track?order_id=${encodeURIComponent(orderId)}`;
}

/** Dev-only: allow JSON fallback when checkout-svc / order-svc unavailable. */
export function allowLocalDev(): boolean {
  return (
    process.env.AQOND_LOCAL_DEV === '1' ||
    process.env.AQOND_ALLOW_LOCAL_ORDERS === '1' ||
    process.env.NEXT_PUBLIC_AQOND_LOCAL_DEV === '1' ||
    process.env.NEXT_PUBLIC_AQOND_ALLOW_LOCAL_ORDERS === '1'
  );
}

export function allowLocalOrders(): boolean {
  return allowLocalDev();
}

/** Legacy meerak Node backend (shared users/JWT with mobile app). */
export function meerakBackendBase(): string {
  const url =
    process.env.MEERAK_BACKEND_URL ||
    process.env.V1_API_URL ||
    process.env.NEXT_PUBLIC_MEERAK_BACKEND_URL ||
    'http://127.0.0.1:3001';
  return url.replace(/\/$/, '');
}
