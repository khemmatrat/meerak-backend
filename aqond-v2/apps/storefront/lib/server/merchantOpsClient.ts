import { kongBase } from '@/lib/server-env';
import { upstreamAuthHeaders, type UpstreamAuth } from '@/lib/server/upstreamAuth';

const TIMEOUT_MS = 4000;

export function merchantOpsApi(path: string): string {
  return `${kongBase()}/api/v1/merchant-ops${path}`;
}

export async function merchantOpsFetch<T>(
  path: string,
  init?: RequestInit,
  auth?: UpstreamAuth,
): Promise<T | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(merchantOpsApi(path), {
      ...init,
      cache: 'no-store',
      signal: ctrl.signal,
      headers: {
        ...upstreamAuthHeaders(auth),
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function merchantOpsAvailable(): boolean {
  return process.env.AQOND_MERCHANT_OPS_FALLBACK !== '1';
}
