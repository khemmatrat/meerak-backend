import type { AuthState } from '@/lib/bff';

/** Auth headers for Talent read proxy + Services client APIs */
export function talentAuthHeaders(auth?: AuthState | null): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth?.token) h.Authorization = `Bearer ${auth.token}`;
  if (auth?.userId) h['X-User-Id'] = auth.userId;
  if (auth?.sessionId) h['X-Session-Id'] = auth.sessionId;
  return h;
}

/** @deprecated Talent reads use `/api/talent/read` or `/api/bff` — do not call from client */
export function meerakLegacyApiBase(): string {
  const env = process.env.NEXT_PUBLIC_MEERAK_BACKEND_URL;
  if (env) return env.replace(/\/$/, '');
  return '';
}

export function meerakLegacyUrl(path: string): string {
  const base = meerakLegacyApiBase();
  const p = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}
