import { NextRequest, NextResponse } from 'next/server';
import { meerakBackendBase } from '@/lib/server-env';
import { upstreamAuthFromRequest, upstreamAuthHeaders } from '@/lib/server/upstreamAuth';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const segments = (await ctx.params).path || [];
  const segment = segments.join('/');
  const userId = req.nextUrl.searchParams.get('userId') || '';
  const auth = upstreamAuthFromRequest(req);

  const backendPath =
    segment === 'status'
      ? '/api/growth/status'
      : segment === 'plans'
        ? '/api/growth/plans'
        : segment === 'home-personalized'
          ? '/api/home/personalized'
          : segment === 'merchants-top10'
            ? '/api/merchants/top10'
            : segment === 'aqond-pass'
              ? '/api/aqond-pass'
              : null;

  if (!backendPath) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const q = new URLSearchParams();
  if (userId) q.set('userId', userId);
  req.nextUrl.searchParams.forEach((v, k) => {
    if (k !== 'userId') q.set(k, v);
  });

  try {
    const url = `${meerakBackendBase()}${backendPath}${q.toString() ? `?${q}` : ''}`;
    const res = await fetch(url, {
      cache: 'no-store',
      headers: upstreamAuthHeaders({ ...auth, userId: auth.userId || userId }),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'backend_unavailable' }, { status: 503 });
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const segments = (await ctx.params).path || [];
  const segment = segments.join('/');
  const auth = upstreamAuthFromRequest(req);
  const body = await req.json().catch(() => ({}));

  const backendPath =
    segment === 'referral/sync'
      ? '/api/growth/referral/sync'
      : segment === 'wallet-activated'
        ? '/api/growth/wallet-activated'
        : segment === 'mystery-box/claim'
          ? '/api/growth/mystery-box/claim'
          : segment === 'app-open'
            ? '/api/growth/app-open'
            : segment === 'intent-dwell'
              ? '/api/intent/dwell'
              : segment === 'aqond-pass/activate'
                ? '/api/aqond-pass/activate'
                : null;

  if (!backendPath) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  try {
    const res = await fetch(`${meerakBackendBase()}${backendPath}`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...upstreamAuthHeaders({ ...auth, userId: auth.userId || body.userId }),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'backend_unavailable' }, { status: 503 });
  }
}
