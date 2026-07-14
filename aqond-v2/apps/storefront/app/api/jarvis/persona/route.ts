import { NextRequest, NextResponse } from 'next/server';
import { meerakBackendBase } from '@/lib/server-env';
import { upstreamAuthHeaders, type UpstreamAuth } from '@/lib/server/upstreamAuth';

function authFromRequest(req: NextRequest): UpstreamAuth | undefined {
  const token = req.headers.get('authorization');
  const userId = req.headers.get('x-user-id');
  if (!token && !userId) return undefined;
  return { token: token || undefined, userId: userId || undefined };
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId') || req.headers.get('x-user-id');
  const q = new URLSearchParams();
  if (userId) q.set('userId', userId);
  for (const key of ['message', 'surface', 'country_hint', 'is_food']) {
    const v = req.nextUrl.searchParams.get(key);
    if (v) q.set(key, v);
  }
  const res = await fetch(`${meerakBackendBase()}/api/jarvis/persona?${q}`, {
    cache: 'no-store',
    headers: {
      ...upstreamAuthHeaders(authFromRequest(req)),
      'Accept-Language': req.headers.get('accept-language') || '',
    },
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
