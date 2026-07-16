import { meerakBackendBase } from '@/lib/server-env';
import type { UpstreamAuth } from '@/lib/server/upstreamAuth';
import { upstreamAuthHeaders } from '@/lib/server/upstreamAuth';

function backendHeaders(auth: UpstreamAuth): Record<string, string> {
  return upstreamAuthHeaders(auth);
}

export async function proxyRiderCodSummary(auth: UpstreamAuth) {
  const base = meerakBackendBase();
  const res = await fetch(`${base}/api/rider-os/cod/summary`, {
    headers: backendHeaders(auth),
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function proxyRiderCodCollected(
  auth: UpstreamAuth,
  jobId: string,
  body: { amount_micro?: number; method?: string; photo_url?: string },
) {
  const base = meerakBackendBase();
  const res = await fetch(`${base}/api/rider-os/jobs/${encodeURIComponent(jobId)}/cod/collected`, {
    method: 'POST',
    headers: backendHeaders(auth),
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function proxyRiderCodDeposit(
  auth: UpstreamAuth,
  body: { job_id: string; method?: string; reference?: string },
) {
  const base = meerakBackendBase();
  const res = await fetch(`${base}/api/rider-os/cod/deposit`, {
    method: 'POST',
    headers: backendHeaders(auth),
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function proxyRiderCodReserve(
  auth: UpstreamAuth,
  jobId: string,
  body: {
    amount_micro: number;
    payment_method?: string;
    order_id?: string;
  },
) {
  const base = meerakBackendBase();
  const res = await fetch(`${base}/api/rider-os/jobs/${encodeURIComponent(jobId)}/cod/reserve`, {
    method: 'POST',
    headers: backendHeaders(auth),
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}
