/** Shared identity with g:\meerak\mobile — same localStorage keys and legacy JWT API. */

export const MEERAK_TOKEN_KEY = 'meerak_token';
export const MEERAK_USER_ID_KEY = 'meerak_user_id';
export const MEERAK_SESSION_ID_KEY = 'meerak_session_id';
const LEGACY_AQOND_KEY = 'aqond_auth';

/** Client auth base — same-origin proxy by default; Kong when NEXT_PUBLIC_AUTH_VIA_KONG=1 */
export function authApiBase(): string {
  if (typeof window === 'undefined') return '/api/auth';
  if (process.env.NEXT_PUBLIC_AUTH_VIA_KONG === '1') {
    const kong = (process.env.NEXT_PUBLIC_KONG_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
    return `${kong}/api/auth`;
  }
  return '/api/auth';
}

export type MeerakUser = {
  id: string;
  phone?: string;
  name?: string;
  email?: string;
  role?: string;
  avatar_url?: string;
};

export type MeerakAuthPayload = {
  token: string;
  user: MeerakUser;
};

function parseAuthError(data: unknown, status: number): string {
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    if (typeof o.error === 'string' && o.error.trim()) return o.error.trim();
    if (typeof o.message === 'string' && o.message.trim()) return o.message.trim();
  }
  if (status === 401) return 'เบอร์โทรหรือรหัสผ่านไม่ถูกต้อง';
  if (status === 403) return 'บัญชีถูกระงับ — ติดต่อฝ่ายสนับสนุน';
  if (status === 429) return 'ลองหลายครั้งเกินไป — รอ 1–2 นาทีแล้วลองใหม่';
  return 'เข้าสู่ระบบไม่สำเร็จชั่วคราว';
}

async function authPost<T>(path: string, body: unknown, headers?: Record<string, string>): Promise<T> {
  const res = await fetch(`${authApiBase()}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  let data: unknown = {};
  try {
    data = await res.json();
  } catch {
    /* non-json */
  }
  if (!res.ok) throw new Error(parseAuthError(data, res.status));
  return data as T;
}

export function readStoredAuth(): { token: string; userId: string; sessionId: string } | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem(MEERAK_TOKEN_KEY);
  const userId = localStorage.getItem(MEERAK_USER_ID_KEY);
  const sessionId = localStorage.getItem(MEERAK_SESSION_ID_KEY) || userId || '';
  if (token && userId) return { token, userId, sessionId };

  const legacy = localStorage.getItem(LEGACY_AQOND_KEY);
  if (legacy) {
    try {
      const old = JSON.parse(legacy) as { token?: string; userId?: string };
      if (old.token && old.userId) {
        persistAuth(old.token, old.userId, old.userId);
        localStorage.removeItem(LEGACY_AQOND_KEY);
        return { token: old.token, userId: old.userId, sessionId: old.userId };
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function persistAuth(token: string, userId: string, sessionId?: string) {
  localStorage.setItem(MEERAK_TOKEN_KEY, token);
  localStorage.setItem(MEERAK_USER_ID_KEY, userId);
  if (sessionId) localStorage.setItem(MEERAK_SESSION_ID_KEY, sessionId);
  localStorage.removeItem(LEGACY_AQOND_KEY);
}

export function clearStoredAuth() {
  localStorage.removeItem(MEERAK_TOKEN_KEY);
  localStorage.removeItem(MEERAK_USER_ID_KEY);
  localStorage.removeItem(MEERAK_SESSION_ID_KEY);
  localStorage.removeItem(LEGACY_AQOND_KEY);
}

/**
 * Build v2 handoff URL from mobile app (token in hash — not sent to server logs).
 * Example: buildMarketplaceHandoffUrl('https://aqond.com', token, userId, '/m/merchant/shops')
 */
export function buildMarketplaceHandoffUrl(
  marketplaceBase: string,
  token: string,
  userId: string,
  next = '/m/account',
): string {
  const base = marketplaceBase.replace(/\/$/, '');
  const path = next.startsWith('/') ? next : `/${next}`;
  const hash = new URLSearchParams({
    t: token,
    u: userId,
    next: path,
  });
  return `${base}/m/auth/handoff#${hash.toString()}`;
}

/** Mobile deep link handoff — token in URL hash (#t=...&u=...) */
export function applyHandoffFromHash(): { ok: boolean; next: string } {
  if (typeof window === 'undefined') return { ok: false, next: '/m/home' };
  const raw = window.location.hash.replace(/^#/, '').trim();
  if (!raw) return { ok: false, next: '/m/home' };
  const params = new URLSearchParams(raw);
  const token = params.get('t');
  const userId = params.get('u');
  const next = params.get('next') || '/m/home';
  if (!token || !userId) return { ok: false, next: '/m/login' };
  if (token.startsWith('mock_') || token.startsWith('mock-jwt')) {
    return { ok: false, next: '/m/login' };
  }
  persistAuth(token, userId);
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return { ok: true, next: next.startsWith('/') ? next : '/m/home' };
}

export async function loginWithPhone(phone: string, password: string): Promise<MeerakAuthPayload> {
  const trimmedPhone = String(phone || '').trim();
  const trimmedPassword = String(password || '').trim();
  const data = await authPost<{ token?: string; user?: MeerakUser }>('login', {
    phone: trimmedPhone,
    password: trimmedPassword,
  });
  if (!data.token || !data.user?.id) throw new Error('Login failed: no token or user returned');
  if (data.token.startsWith('mock_') || data.token.startsWith('mock-jwt')) {
    throw new Error('Invalid token from backend');
  }
  persistAuth(data.token, data.user.id);
  return { token: data.token, user: data.user };
}

export type RegisterInput = {
  phone: string;
  password: string;
  name: string;
  firebase_uid: string;
  role?: string;
  referral_code?: string;
};

export async function registerAccount(
  input: RegisterInput,
  opts?: { idempotencyKey?: string; attempt?: number },
): Promise<MeerakAuthPayload> {
  const headers: Record<string, string> = {};
  if (opts?.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey.slice(0, 160);
  if (opts?.attempt != null) headers['x-registration-client-attempt'] = String(opts.attempt);

  const data = await authPost<{ token?: string; user?: MeerakUser }>(
    'register',
    {
      phone: String(input.phone || '').trim(),
      password: String(input.password || '').trim(),
      name: String(input.name || '').trim(),
      firebase_uid: input.firebase_uid,
      role: input.role || 'user',
      referral_code: input.referral_code,
    },
    headers,
  );
  if (!data.token || !data.user?.id) throw new Error('Register failed: no token or user returned');
  persistAuth(data.token, data.user.id);
  return { token: data.token, user: data.user };
}
