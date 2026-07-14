import type { AuthState } from '@/lib/bff';

/** Auth headers for /api/merchant/* routes (forward JWT to server → Kong). */
export function merchantHeaders(auth?: AuthState | null): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth?.userId) h['X-User-Id'] = auth.userId;
  if (auth?.sessionId) h['X-Session-Id'] = auth.sessionId;
  if (auth?.token) h['Authorization'] = `Bearer ${auth.token}`;
  return h;
}
