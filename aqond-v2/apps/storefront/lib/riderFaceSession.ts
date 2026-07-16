import {
  getRiderDeviceFingerprint,
  loadRiderFaceSessionToken,
  saveRiderFaceSessionToken,
} from '@/lib/riderFaceDevice';

/** daily = ตอกบัตรเช้า | strict = เข้มงวดทุก N วัน | passenger = ก่อนรับผู้โดยสาร */
export type RiderFaceVerifyPurpose = 'daily' | 'strict' | 'passenger' | 'online' | 'reverify';

export type RiderFaceLivenessStep = {
  id: 'center' | 'turn_left' | 'turn_right' | 'blink';
  completed_at: string;
};

export type RiderFaceSessionStatus = {
  verify_level: 'standard' | 'strong';
  workday?: string;
  daily_active: boolean;
  daily_expires_at: string | null;
  daily_reset_hour?: number;
  strict_due: boolean;
  strict_active: boolean;
  strict_interval_days: number;
  strict_interval_days_relaxed?: number;
  strict_last_at?: string | null;
  passenger_active: boolean;
  passenger_expires_at: string | null;
  match_threshold: number;
  high_cod_micro: number;
  /** backward-compat */
  online_active?: boolean;
  reverify_due?: boolean;
  reverify_interval_days?: number;
};

export async function fetchRiderFaceSession(
  riderId: string,
  token?: string,
): Promise<RiderFaceSessionStatus | null> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api/rider/face/session?rider_id=${encodeURIComponent(riderId)}`, {
    cache: 'no-store',
    headers,
  });
  if (!res.ok) return null;
  const data = (await res.json()) as RiderFaceSessionStatus;
  return {
    ...data,
    daily_active: data.daily_active ?? !!data.online_active,
    strict_due: data.strict_due ?? !!data.reverify_due,
  };
}

export async function verifyRiderFace(input: {
  riderId: string;
  purpose: RiderFaceVerifyPurpose;
  selfieBase64: string;
  liveness: { steps: RiderFaceLivenessStep[] };
  lat?: number;
  lng?: number;
  token?: string;
}) {
  const purpose =
    input.purpose === 'online'
      ? 'daily'
      : input.purpose === 'reverify'
        ? 'strict'
        : input.purpose;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (input.token) headers.Authorization = `Bearer ${input.token}`;
  const res = await fetch('/api/rider/face/verify', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      rider_id: input.riderId,
      purpose,
      selfie_base64: input.selfieBase64,
      liveness: input.liveness,
      device_fingerprint: getRiderDeviceFingerprint(),
      lat: input.lat,
      lng: input.lng,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data.message ||
      (data.error === 'face_match_failed'
        ? `ใบหน้าไม่ตรง (score ${data.score ?? '?'} < ${data.threshold ?? '?'})`
        : data.error || 'ยืนยันใบหน้าไม่สำเร็จ');
    throw new Error(msg);
  }
  if (data.session_token) saveRiderFaceSessionToken(data.session_token);
  return data as {
    session_token: string;
    match_score: number;
    expires_at: string;
    verify_level: string;
    workday?: string;
  };
}

export function riderFaceContextForJob(job: {
  job_type?: string;
  payment_method?: string;
  amount_micro?: number;
}) {
  const jt = String(job.job_type || '').toLowerCase();
  const pm = String(job.payment_method || '').toLowerCase();
  const isPassenger = jt === 'passenger';
  const isCod = pm === 'cod' || !pm;
  return { isPassenger, isCod, jobType: jt, paymentMethod: pm };
}

export { loadRiderFaceSessionToken, saveRiderFaceSessionToken, getRiderDeviceFingerprint };
