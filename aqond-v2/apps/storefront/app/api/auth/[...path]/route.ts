import { NextRequest, NextResponse } from 'next/server';
import { meerakBackendBase } from '@/lib/server-env';

const ALLOWED = new Set([
  'login',
  'register',
  'forgot-password',
  'reset-password',
]);

function backendUrl(pathSegs: string[]): string | null {
  const path = pathSegs.join('/');
  if (!ALLOWED.has(path)) return null;
  const base = meerakBackendBase();
  return `${base}/api/auth/${path}`;
}

async function proxy(req: NextRequest, ctx: { params: { path: string[] } }) {
  const url = backendUrl(ctx.params.path);
  if (!url) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const headers: Record<string, string> = {
    'Content-Type': req.headers.get('content-type') || 'application/json',
  };
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  if (auth) headers.Authorization = auth;
  const idem =
    req.headers.get('idempotency-key') ||
    req.headers.get('Idempotency-Key') ||
    req.headers.get('x-idempotency-key');
  if (idem) headers['Idempotency-Key'] = idem;
  const attempt = req.headers.get('x-registration-client-attempt');
  if (attempt) headers['x-registration-client-attempt'] = attempt;
  const ua = req.headers.get('user-agent');
  if (ua) headers['User-Agent'] = ua;
  const fwd = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip');
  if (fwd) headers['X-Forwarded-For'] = fwd;

  let body: string | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await req.text();
  }

  try {
    const res = await fetch(url, { method: req.method, headers, body, cache: 'no-store' });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/json' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'upstream_error';
    return NextResponse.json({ error: 'meerak_backend_unreachable', detail: msg }, { status: 502 });
  }
}

export const GET = proxy;
export const POST = proxy;
