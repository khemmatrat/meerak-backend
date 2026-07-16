import type { AuthState } from '@/lib/bff';
import { readStoredAuth } from '@/lib/meerakAuth';

/** Client → storefront API headers with login token (shared with mobile localStorage). */
export function riderClientAuthHeaders(
  auth?: AuthState | null,
  extra?: Record<string, string>,
): Record<string, string> {
  const stored = typeof window !== 'undefined' ? readStoredAuth() : null;
  const userId = auth?.userId || stored?.userId;
  const token = auth?.token || stored?.token;
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra,
  };
  if (userId) h['X-User-Id'] = userId;
  if (auth?.sessionId) h['X-Session-Id'] = auth.sessionId;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}
