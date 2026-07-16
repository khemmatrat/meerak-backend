/**
 * Rider dispatch routing — production must use dispatch-svc; local dev may fall back to JSON store.
 */
export type RiderDispatchMode = 'dispatch-svc' | 'local-fallback' | 'unconfigured';

function dispatchSvcConfigured(): boolean {
  const url = (
    process.env.DISPATCH_SVC_URL ||
    process.env.DISPATCH_API_URL ||
    process.env.KONG_API_URL ||
    process.env.NEXT_PUBLIC_KONG_API_URL ||
    ''
  ).trim();
  return url.length > 0 && !url.includes('127.0.0.1:0');
}

function localDevEnabled(): boolean {
  return (
    process.env.AQOND_LOCAL_DEV === '1' ||
    process.env.NEXT_PUBLIC_AQOND_LOCAL_DEV === '1' ||
    process.env.AQOND_ALLOW_LOCAL_ORDERS === '1' ||
    process.env.NEXT_PUBLIC_AQOND_ALLOW_LOCAL_ORDERS === '1'
  );
}

export function getRiderDispatchMode(): RiderDispatchMode {
  if (dispatchSvcConfigured()) return 'dispatch-svc';
  if (localDevEnabled()) return 'local-fallback';
  return 'unconfigured';
}

export function shouldUseDispatchFallback(): boolean {
  return getRiderDispatchMode() === 'local-fallback';
}

export function riderDispatchReadiness(): {
  mode: RiderDispatchMode;
  dispatch_url_set: boolean;
  local_fallback: boolean;
  production_safe: boolean;
} {
  const mode = getRiderDispatchMode();
  return {
    mode,
    dispatch_url_set: dispatchSvcConfigured(),
    local_fallback: mode === 'local-fallback',
    production_safe: mode === 'dispatch-svc',
  };
}
