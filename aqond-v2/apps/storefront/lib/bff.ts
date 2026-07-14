const BFF_SERVER = process.env.BFF_URL || 'http://127.0.0.1:8000/api/v1/bff';
/** Browser calls same-origin proxy to avoid Kong CORS on localhost:3000 */
const BFF_CLIENT = '/api/bff';
const BFF = typeof window === 'undefined' ? BFF_SERVER : BFF_CLIENT;
const REGION = process.env.AQOND_REGION || process.env.NEXT_PUBLIC_AQOND_REGION || 'TH';

export type AuthState = {
  token: string;
  userId: string;
  sessionId: string;
};

function headers(auth?: AuthState | null, locale?: string): HeadersInit {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Aqond-Region': REGION,
  };
  if (locale) h['Accept-Language'] = locale;
  if (auth?.userId) h['X-User-Id'] = auth.userId;
  if (auth?.sessionId) h['X-Session-Id'] = auth.sessionId;
  if (auth?.token) h['Authorization'] = `Bearer ${auth.token}`;
  return h;
}

export async function bffGet<T>(path: string, auth?: AuthState | null, locale?: string): Promise<T> {
  const isServer = typeof window === 'undefined';
  const init: RequestInit & { next?: { revalidate?: number } } = {
    headers: headers(auth, locale),
    cache: isServer ? (path.startsWith('/v1/product') ? undefined : 'no-store') : 'no-store',
  };
  if (isServer && path.startsWith('/v1/product')) {
    init.next = { revalidate: 60 };
  }
  const res = await fetch(`${BFF}${path}`, init);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function bffPost<T>(path: string, body: unknown, auth?: AuthState | null): Promise<T> {
  const res = await fetch(`${BFF}${path}`, {
    method: 'POST',
    headers: headers(auth),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export { BFF, REGION };
