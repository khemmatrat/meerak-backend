import type { AuthSession } from '@/lib/auth';

export type RiderCodHold = {
  id: string;
  job_id: string;
  order_id?: string;
  amount_micro: number;
  status: 'held' | 'collected' | 'deposited' | 'released' | 'forfeited';
  created_at?: string;
  collected_at?: string;
};

export type RiderCodSummary = {
  rider_id: string;
  outstanding_micro: number;
  limit_micro: number;
  available_cod_limit_micro: number;
  cod_outstanding?: number;
  cod_limit?: number;
  available_cod_limit?: number;
  pending_deposit_micro?: number;
  open_holds: RiderCodHold[];
  tier?: string | null;
  status?: string;
  provisional?: boolean;
};

function authHeaders(auth?: AuthSession | null): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth?.token) h.Authorization = `Bearer ${auth.token}`;
  if (auth?.userId) h['x-user-id'] = auth.userId;
  if (auth?.sessionId) h['x-session-id'] = auth.sessionId;
  return h;
}

export async function fetchRiderCodSummary(auth?: AuthSession | null): Promise<RiderCodSummary> {
  const res = await fetch('/api/rider/cod/summary', {
    cache: 'no-store',
    headers: authHeaders(auth),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || `cod_summary_${res.status}`);
  }
  return data as RiderCodSummary;
}

export function emptyRiderCodSummary(riderId: string): RiderCodSummary {
  return {
    rider_id: riderId,
    outstanding_micro: 0,
    limit_micro: 200_000,
    available_cod_limit_micro: 200_000,
    pending_deposit_micro: 0,
    open_holds: [],
    provisional: true,
  };
}

export async function markRiderCodCollected(
  jobId: string,
  input: { amount_micro?: number; method?: string; photo_url?: string },
  auth?: AuthSession | null,
) {
  const res = await fetch(`/api/rider/jobs/${encodeURIComponent(jobId)}/cod/collected`, {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || 'cod_collect_failed');
  return data;
}

export async function submitRiderCodDeposit(
  input: { job_id: string; method?: string; reference?: string },
  auth?: AuthSession | null,
) {
  const res = await fetch('/api/rider/cod/deposit', {
    method: 'POST',
    headers: authHeaders(auth),
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || 'cod_deposit_failed');
  return data;
}

export function formatCodThb(micro: number) {
  return (Number(micro || 0) / 100).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
