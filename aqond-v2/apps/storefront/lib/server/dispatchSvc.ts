import { dispatchApi } from '@/lib/server-env';
import type { RiderTrackingView } from '@/lib/server/riderTracking';
import { upstreamAuthHeaders, type UpstreamAuth } from '@/lib/server/upstreamAuth';
import {
  localAcceptDispatchJob,
  localAdvanceDispatchPhase,
  localCreateDispatchJob,
  localListDispatchJobs,
  type LocalDispatchJob,
} from '@/lib/server/localDispatch';

const TIMEOUT_MS = 4000;

function localDevFallback(): boolean {
  return (
    process.env.AQOND_LOCAL_DEV === '1' ||
    process.env.NEXT_PUBLIC_AQOND_LOCAL_DEV === '1'
  );
}

async function dispatchFetch<T>(
  path: string,
  init?: RequestInit,
  auth?: UpstreamAuth,
): Promise<T | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(dispatchApi(path), {
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

export type DispatchJob = {
  id: string;
  order_id: string;
  merchant_id: string;
  rider_id?: string;
  status: string;
  phase: string;
  merchant_name?: string;
  items_summary?: string;
  address?: string;
  amount_micro?: number;
  payment_method?: string;
  job_type?: 'food' | 'parcel';
  pickup_lat?: number;
  pickup_lng?: number;
  dropoff_lat?: number;
  dropoff_lng?: number;
};

export async function createDispatchJob(input: {
  order_id: string;
  merchant_id: string;
  buyer_id?: string;
  merchant_name?: string;
  items_summary?: string;
  address?: string;
  handoff_note?: string;
  eta_label?: string;
  payment_method?: string;
  amount_micro?: number;
  fulfillment_phase?: string;
  job_type?: 'food' | 'parcel';
  recipient_name?: string;
  customer_phone?: string;
}, auth?: UpstreamAuth) {
  const upstream = await dispatchFetch<{ job: DispatchJob; created: boolean }>('/v1/dispatch/jobs', {
    method: 'POST',
    body: JSON.stringify(input),
  }, { ...auth, userId: auth?.userId || input.buyer_id || input.merchant_id });
  if (upstream) return upstream;
  if (!localDevFallback()) return null;
  return localCreateDispatchJob(input);
}

export async function getDispatchTracking(orderId: string) {
  return dispatchFetch<RiderTrackingView>(`/v1/dispatch/track/${encodeURIComponent(orderId)}`);
}

export async function listDispatchJobs(opts: { rider_id?: string; status?: string }) {
  const q = new URLSearchParams();
  if (opts.rider_id) q.set('rider_id', opts.rider_id);
  if (opts.status) q.set('status', opts.status);
  const suffix = q.toString() ? `?${q}` : '';
  const upstream = await dispatchFetch<{ jobs: DispatchJob[]; source?: string }>(`/v1/dispatch/jobs${suffix}`);
  if (upstream) return upstream;
  if (!localDevFallback()) return null;
  return localListDispatchJobs(opts) as { jobs: LocalDispatchJob[]; source: string };
}

export async function acceptDispatchJob(jobId: string, riderId: string, auth?: UpstreamAuth) {
  const upstream = await dispatchFetch<{ job: DispatchJob }>(`/v1/dispatch/jobs/${jobId}/accept`, {
    method: 'POST',
    body: JSON.stringify({ rider_id: riderId }),
    headers: { 'X-Rider-Id': riderId },
  }, { ...auth, userId: auth?.userId || riderId });
  if (upstream) return upstream;
  if (!localDevFallback()) return null;
  return localAcceptDispatchJob(jobId, riderId);
}

export async function advanceDispatchPhase(
  jobId: string,
  body: { phase?: string; rider_id?: string; photo_url?: string; lat?: number; lng?: number },
  auth?: UpstreamAuth,
) {
  const upstream = await dispatchFetch<{ job: DispatchJob; tracking?: RiderTrackingView }>(
    `/v1/dispatch/jobs/${jobId}/phase`,
    { method: 'POST', body: JSON.stringify(body) },
    { ...auth, userId: auth?.userId || body.rider_id },
  );
  if (upstream) return upstream;
  if (!localDevFallback()) return null;
  const local = await localAdvanceDispatchPhase(jobId, body);
  if (!local) return null;
  return { job: local.job };
}

export async function updateDispatchLocation(jobId: string, lat: number, lng: number, auth?: UpstreamAuth) {
  return dispatchFetch<{ ok: boolean }>(`/v1/dispatch/jobs/${jobId}/location`, {
    method: 'POST',
    body: JSON.stringify({ lat, lng }),
  }, auth);
}

export async function submitDispatchReview(
  orderId: string,
  body: { stars: number; comment?: string; tip_micro?: number },
  auth?: UpstreamAuth,
) {
  return dispatchFetch<RiderTrackingView>(`/v1/dispatch/track/${encodeURIComponent(orderId)}/review`, {
    method: 'POST',
    body: JSON.stringify(body),
  }, auth);
}

export async function submitDispatchChat(
  orderId: string,
  body: { from: 'rider' | 'customer'; text: string },
  auth?: UpstreamAuth,
) {
  return dispatchFetch<RiderTrackingView>(
    `/v1/dispatch/track/${encodeURIComponent(orderId)}/chat`,
    { method: 'POST', body: JSON.stringify(body) },
    auth,
  );
}

export function dispatchTrackWsUrl(orderId: string): string {
  const base = dispatchApi('/v1/dispatch/ws/track').replace(/^http/, 'ws');
  return `${base}?order_id=${encodeURIComponent(orderId)}`;
}

export function shouldUseDispatchFallback(): boolean {
  return localDevFallback();
}
