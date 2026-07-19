import type { AuthState } from '@/lib/bff';
import { talentAuthHeaders } from '@/lib/talent/talentClient';

/** Same-origin Talent read proxy — parallel to `/api/bff` for marketplace wallet */
const TALENT_READ_CLIENT = '/api/talent/read';

export async function talentReadGet<T>(path: string, auth?: AuthState | null): Promise<T> {
  const normalized = path.startsWith('/') ? path.slice(1) : path;
  const res = await fetch(`${TALENT_READ_CLIENT}/${normalized}`, {
    headers: talentAuthHeaders(auth),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(await res.text().catch(() => 'talent_read_unavailable'));
  }
  return res.json() as Promise<T>;
}

export { TALENT_READ_CLIENT };
