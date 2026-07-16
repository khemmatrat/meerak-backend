import type { UpstreamAuth } from '@/lib/server/upstreamAuth';
import { meerakBackendBase } from '@/lib/server-env';
import { upstreamAuthHeaders } from '@/lib/server/upstreamAuth';

export type RiderFaceCheckResult = {
  ok: boolean;
  code?: string;
  needs_verify?: 'daily' | 'strict' | 'passenger' | 'online' | 'reverify';
  verify_level?: string;
  strict_interval_days?: number;
  suspended?: boolean;
  message?: string;
};

export type RiderFaceSessionStatus = {
  verify_level: 'standard' | 'strong';
  workday?: string;
  daily_active: boolean;
  daily_expires_at: string | null;
  strict_due: boolean;
  strict_active: boolean;
  strict_interval_days: number;
  strict_interval_days_relaxed?: number;
  passenger_active: boolean;
  passenger_expires_at: string | null;
  match_threshold: number;
  high_cod_micro: number;
  online_active?: boolean;
  reverify_due?: boolean;
};

export async function fetchRiderFaceSessionStatus(
  riderId: string,
  auth?: UpstreamAuth,
): Promise<RiderFaceSessionStatus | null> {
  const base = meerakBackendBase();
  const res = await fetch(
    `${base}/api/rider-os/face/session?rider_id=${encodeURIComponent(riderId)}`,
    { headers: upstreamAuthHeaders(auth), cache: 'no-store' },
  );
  if (!res.ok) return null;
  return res.json() as Promise<RiderFaceSessionStatus>;
}

export async function checkRiderFaceActionServer(
  body: {
    rider_id: string;
    action: 'go_online' | 'accept_job';
    face_session_token?: string;
    device_fingerprint?: string;
    lat?: number;
    lng?: number;
    job_type?: string;
    payment_method?: string;
    amount_micro?: number;
  },
  auth?: UpstreamAuth,
): Promise<RiderFaceCheckResult> {
  const base = meerakBackendBase();
  const res = await fetch(`${base}/api/rider-os/face/check-action`, {
    method: 'POST',
    headers: upstreamAuthHeaders(auth),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return data as RiderFaceCheckResult;
}
