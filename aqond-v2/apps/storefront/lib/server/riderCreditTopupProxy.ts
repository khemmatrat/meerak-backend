import { meerakBackendBase } from '@/lib/server-env';
import type { UpstreamAuth } from '@/lib/server/upstreamAuth';
import { upstreamAuthHeaders } from '@/lib/server/upstreamAuth';

function backendHeaders(auth: UpstreamAuth): Record<string, string> {
  return upstreamAuthHeaders(auth);
}

export async function proxyRiderCreditTopupWallet(
  auth: UpstreamAuth,
  body: { rider_id: string; amount_micro: number; idempotency_key?: string },
) {
  const base = meerakBackendBase();
  const res = await fetch(`${base}/api/rider-os/credits/topup/wallet`, {
    method: 'POST',
    headers: backendHeaders(auth),
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function proxyRiderCreditTopupPromptPay(
  auth: UpstreamAuth,
  body: { amount: number; rider_id?: string },
) {
  const base = meerakBackendBase();
  const res = await fetch(`${base}/api/rider-os/credits/topup/promptpay`, {
    method: 'POST',
    headers: backendHeaders(auth),
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function proxyRiderCreditTopupStatus(auth: UpstreamAuth, chargeId: string) {
  const base = meerakBackendBase();
  const res = await fetch(
    `${base}/api/rider-os/credits/topup/status/${encodeURIComponent(chargeId)}`,
    {
      headers: backendHeaders(auth),
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    },
  );
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}
