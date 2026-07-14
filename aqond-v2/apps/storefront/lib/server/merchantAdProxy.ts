import { meerakBackendBase } from '@/lib/server-env';

type ProxyResult<T> = { ok: true; data: T } | { ok: false; fallback: true; status?: number };

export async function proxyMerchantAd<T>(
  path: string,
  init?: RequestInit,
): Promise<ProxyResult<T>> {
  const base = meerakBackendBase();
  const devKey = process.env.AIVOS_MERCHANT_AD_DEV_KEY || '';
  try {
    const res = await fetch(`${base}${path}`, {
      ...init,
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...(devKey ? { 'X-Aivos-Merchant-Ad-Key': devKey } : {}),
        ...(init?.headers || {}),
      },
    });
    if (res.status === 503 || res.status === 404) return { ok: false, fallback: true, status: res.status };
    const json = await res.json();
    if (!res.ok) {
      return {
        ok: false,
        fallback: res.status === 401 || res.status === 503 || res.status === 404,
        status: res.status,
      };
    }
    return { ok: true, data: (json.data ?? json) as T };
  } catch {
    return { ok: false, fallback: true };
  }
}

export function unwrapEnvelope<T>(payload: T & { quota?: unknown; jobs?: unknown; brief?: unknown; job?: unknown }) {
  return payload;
}
