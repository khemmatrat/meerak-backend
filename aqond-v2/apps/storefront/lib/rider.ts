import type { RiderTrackingView } from '@/lib/server/riderTracking';

export const RIDER_KEY = 'aqond_rider_id';

/** One AQOND account maps to exactly one verified delivery provider profile. */
export type RiderProfile = {
  rider_id: string;
  display_name?: string;
  phone?: string;
  vehicle?: string;
  plate?: string;
  kyc_status?: string;
  active?: boolean;
  suspended?: boolean;
  earnings_micro?: number;
  /** KYC selfie — verified face capture only */
  profile_photo_url?: string | null;
};

export function loadRiderId(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(RIDER_KEY) || '';
}

export function saveRiderId(id: string) {
  if (id) localStorage.setItem(RIDER_KEY, id);
  else localStorage.removeItem(RIDER_KEY);
}

export async function fetchRiderProfile(userId: string, token?: string): Promise<RiderProfile | null> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  headers['X-User-Id'] = userId;

  const res = await fetch(`/api/rider/me?user_id=${encodeURIComponent(userId)}`, {
    cache: 'no-store',
    headers,
  });
  if (res.status === 404) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  if (!data.rider_id) return null;

  let profile_photo_url: string | null = data.profile_photo_url || null;
  if (!profile_photo_url) {
    try {
      const pr = await fetch(`/api/rider/portrait?user_id=${encodeURIComponent(userId)}`, {
        cache: 'no-store',
        headers,
      });
      if (pr.ok) {
        const pd = await pr.json();
        profile_photo_url = pd.portrait_url || null;
      }
    } catch {
      /* optional */
    }
  }

  return { ...(data as RiderProfile), profile_photo_url };
}

export function riderKycLabel(kyc?: string, active?: boolean): string {
  if (active && String(kyc || '').toLowerCase() === 'approved') return 'ยืนยันตัวตนแล้ว';
  const s = String(kyc || '').toLowerCase();
  if (s === 'pending' || s === 'submitted') return 'รอตรวจสอบตัวตน';
  if (s === 'rejected') return 'ไม่ผ่านการยืนยัน';
  return 'ยังไม่ยืนยันตัวตน';
}

export type RiderAvailability = 'online' | 'break' | 'offline';

export const RIDER_REJECT_REASONS = [
  { id: 'too_far', label: 'ไกลเกินไป' },
  { id: 'low_pay', label: 'ค่าจ้างต่ำเกินไป' },
  { id: 'traffic', label: 'จราจรหนาแน่น' },
  { id: 'busy', label: 'ยุ่งอยู่ / มีงานอื่น' },
  { id: 'other', label: 'อื่นๆ' },
] as const;

export type RiderJob = {
  id: string;
  order_id: string;
  merchant_id: string;
  status: string;
  phase: string;
  merchant_name?: string;
  items_summary?: string;
  address?: string;
  amount_micro?: number;
  payment_method?: string;
  job_type?: 'food' | 'parcel' | 'passenger';
  pickup_lat?: number;
  pickup_lng?: number;
  dropoff_lat?: number;
  dropoff_lng?: number;
};

export type RiderDashboard = {
  online: boolean;
  availability?: RiderAvailability;
  gps_ok: boolean;
  today: {
    earnings_micro: number;
    trips: number;
    active_jobs: number;
    acceptance_rate: number;
    cancel_rate: number;
  };
  week?: {
    trips: number;
    earnings_micro: number;
    week_start?: string;
  };
  retention?: {
    streak_days: number;
    tier_id: string;
    tier_label: string;
    completed_trips: number;
    avg_rating: number | null;
    trips_to_next_tier: number | null;
  };
  current_job?: { id: string; order_id: string; phase: string } | null;
  wallet: { earnings_micro: number; withdrawable_micro: number; bonus_micro: number };
  presence?: {
    lat?: number;
    lng?: number;
    speed_kmh?: number;
    battery_pct?: number;
    current_job_id?: string;
  };
};

export async function fetchRiderDashboard(riderId: string): Promise<RiderDashboard | null> {
  const res = await fetch(`/api/rider/dashboard?rider_id=${encodeURIComponent(riderId)}`, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json() as Promise<RiderDashboard>;
}

export async function setRiderOnlineStatus(riderId: string, online: boolean) {
  const availability: RiderAvailability = online ? 'online' : 'offline';
  return setRiderAvailability(riderId, availability);
}

export async function setRiderAvailability(
  riderId: string,
  availability: RiderAvailability,
  opts?: {
    face_session_token?: string;
    device_fingerprint?: string;
    lat?: number;
    lng?: number;
    user_id?: string;
  },
) {
  const res = await fetch('/api/rider/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Rider-Id': riderId },
    body: JSON.stringify({ rider_id: riderId, availability, ...opts }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data.code === 'face_daily_required' || data.code === 'face_verify_required'
        ? 'ต้องสแกนหน้าเช้านี้ (ตอกบัตรเข้างาน) ก่อนเปิดออนไลน์'
        : data.code === 'face_strict_due' || data.code === 'face_reverify_due'
          ? `ครบรอบตรวจเข้มงวด — สแกนหน้าอีกครั้ง`
          : data.error || data.code || 'อัปเดตสถานะไม่สำเร็จ';
    throw new Error(msg);
  }
  return data;
}

export async function sendRiderTelemetry(
  riderId: string,
  body: {
    lat?: number;
    lng?: number;
    speed_kmh?: number;
    battery_pct?: number;
    current_job_id?: string;
    online?: boolean;
  },
) {
  await fetch('/api/rider/telemetry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Rider-Id': riderId },
    body: JSON.stringify({ rider_id: riderId, ...body }),
  });
}

export async function fetchOpenRiderJobs() {
  const res = await fetch('/api/rider/jobs?status=open', { cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'โหลดงานไม่สำเร็จ');
  return data as { jobs: RiderJob[]; source?: string };
}

export async function fetchRiderJobs(riderId: string, mode: 'open' | 'mine' = 'mine') {
  if (mode === 'open') return fetchOpenRiderJobs();
  const q = `rider_id=${encodeURIComponent(riderId)}`;
  const res = await fetch(`/api/rider/jobs?${q}`, { cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'โหลดงานไม่สำเร็จ');
  return data as { jobs: RiderJob[] };
}

export async function rejectRiderJob(jobId: string, riderId: string, reason: string) {
  const res = await fetch(`/api/rider/jobs/${encodeURIComponent(jobId)}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rider_id: riderId, reason }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'ปฏิเสธงานไม่สำเร็จ');
  return data;
}

export async function acceptRiderJob(
  jobId: string,
  riderId: string,
  opts?: {
    face_session_token?: string;
    device_fingerprint?: string;
    lat?: number;
    lng?: number;
    job_type?: string;
    payment_method?: string;
    amount_micro?: number;
    user_id?: string;
  },
) {
  const res = await fetch(`/api/rider/jobs/${encodeURIComponent(jobId)}/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rider_id: riderId, ...opts }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data.code === 'face_passenger_verify_required'
        ? 'ต้องยืนยันใบหน้าก่อนรับงานผู้โดยสาร'
        : data.code === 'face_high_cod_verify_required'
          ? 'ต้องสแกนหน้าเช้านี้ก่อนรับงาน COD มูลค่าสูง'
          : data.code === 'face_strict_due' || data.code === 'face_reverify_due'
            ? 'ครบรอบตรวจเข้มงวด — สแกนหน้าอีกครั้ง'
            : data.code === 'face_daily_required'
              ? 'ต้องสแกนหน้าเช้านี้ (ตอกบัตรเข้างาน)'
              : data.message || data.error || data.code || 'รับงานไม่สำเร็จ';
    throw new Error(msg);
  }
  return data;
}

export async function advanceRiderJob(
  jobId: string,
  body: { phase?: string; rider_id?: string; photo_url?: string; lat?: number; lng?: number },
) {
  const res = await fetch(`/api/rider/jobs/${encodeURIComponent(jobId)}/phase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || 'อัปเดตสถานะไม่สำเร็จ');
  return data as { job: RiderJob; tracking?: RiderTrackingView };
}

export async function sendRiderGps(jobId: string, lat: number, lng: number) {
  await fetch(`/api/rider/jobs/${encodeURIComponent(jobId)}/location`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lng }),
  });
}

export const RIDER_PHASE_LABELS: Record<string, string> = {
  pending_accept: 'รอยืนยันรับงาน (auto-match)',
  rider_assigned: 'ไปรับที่ร้าน',
  rider_picked_up: 'รับของแล้ว — ออกเดินทาง',
  en_route: 'กำลังนำไปส่ง',
  arrived: 'ถึงที่หมาย',
  rider_calling: 'โทรหาลูกค้า',
  photo_proof: 'ถ่ายรูปหลักฐาน',
  handoff: 'ส่งมอบลูกค้า',
  cod_payment: 'เก็บเงินปลายทาง',
  rider_completed: 'ส่งสำเร็จ',
};

export async function sendRiderJobChat(orderId: string, text: string) {
  const res = await fetch(`/api/food/tracking/${encodeURIComponent(orderId)}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, from: 'rider' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'ส่งข้อความไม่สำเร็จ');
  return data as { chat_messages?: Array<{ from: string; text: string; at?: string }> };
}

export function nextRiderAction(phase: string): { phase: string; label: string; needsPhoto?: boolean } | null {
  const flow = Object.keys(RIDER_PHASE_LABELS);
  const i = flow.indexOf(phase);
  if (i < 0 && (phase === 'food_ready' || phase === 'finding_rider')) {
    return { phase: 'rider_assigned', label: 'ยืนยันรับงานแล้ว — ไปรับที่ร้าน' };
  }
  if (i >= 0 && i + 1 < flow.length) {
    const next = flow[i + 1];
    return {
      phase: next,
      label: RIDER_PHASE_LABELS[next],
      needsPhoto: next === 'photo_proof',
    };
  }
  return null;
}
