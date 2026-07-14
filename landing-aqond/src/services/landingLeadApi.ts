/**
 * POST ไปยัง backend (PostgreSQL) — ใช้คู่กับ Firestore userRegistrations
 */
export type LandingLeadPayload = {
  full_name?: string | null;
  contact: string;
  interest_service?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  national_id?: string | null;
  date_of_birth?: string | null;
  address?: string | null;
};

const DEFAULT_PRODUCTION_API = 'https://api.aqond.com';

/**
 * ฐาน URL สำหรับเรียก backend
 * - โหมด dev + VITE_BACKEND_URL ชี้โปรดักชัน: คืน '' เพื่อใช้ path สัมพัทธ์ `/api/...` ผ่าน proxy ใน vite.config (ไม่โดน CORS)
 * - โหมด dev + ชี้ localhost: ใช้ URL เต็มตาม env
 * - build production: ใช้ VITE_BACKEND_URL หรือโปรดักชัน
 */
export function getBackendBaseUrl(): string {
  const raw = import.meta.env.VITE_BACKEND_URL ?? DEFAULT_PRODUCTION_API;
  const trimmed = String(raw).replace(/\/$/, '');
  if (import.meta.env.DEV) {
    if (trimmed === DEFAULT_PRODUCTION_API || trimmed === '') {
      return '';
    }
  }
  return trimmed;
}

export async function submitLandingLeadToBackend(
  payload: LandingLeadPayload
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const api = getBackendBaseUrl();
  try {
    const res = await fetch(`${api}/api/public/landing-lead`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error || `http_${res.status}` };
    }
    return { ok: true, id: data.id };
  } catch {
    return { ok: false, error: 'network' };
  }
}
