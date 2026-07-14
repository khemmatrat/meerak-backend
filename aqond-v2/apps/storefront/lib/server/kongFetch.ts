const KONG = (process.env.KONG_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const TIMEOUT_MS = Number(process.env.KONG_TIMEOUT_MS || 8000);

export async function kongFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${KONG}${path}`, { ...init, signal: ctrl.signal, cache: 'no-store' });
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function kongJson<T>(path: string, init: RequestInit = {}): Promise<T | null> {
  const res = await kongFetch(path, init);
  if (!res?.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export { KONG };
