import { meerakBackendBase } from '@/lib/server-env';
import type { UpstreamAuth } from '@/lib/server/upstreamAuth';

export type DeliveryPartnerRegisterBody = {
  display_name: string;
  phone: string;
  vehicle?: string;
  plate: string;
  bank_account: string;
  source?: string;
  dispatch_rider_id?: string;
};

export async function registerDeliveryPartnerCentral(
  body: DeliveryPartnerRegisterBody,
  auth: UpstreamAuth,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const base = meerakBackendBase();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth.authorization) {
    headers.Authorization = auth.authorization.startsWith('Bearer ')
      ? auth.authorization
      : `Bearer ${auth.authorization}`;
  } else if (auth.userId) {
    const { mintServiceJwt } = await import('@/lib/server/serviceJwt');
    const tok = mintServiceJwt(auth.userId, auth.sessionId);
    if (tok) headers.Authorization = `Bearer ${tok}`;
  }

  try {
    const res = await fetch(`${base}/api/partner/delivery/register`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...body,
        source: body.source || 'aqond_storefront',
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, data };
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : 'meerak_unreachable';
    return { ok: false, status: 503, data: { error: 'meerak_backend_unreachable', detail } };
  }
}
