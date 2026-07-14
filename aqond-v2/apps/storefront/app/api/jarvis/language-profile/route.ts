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
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
  const q = new URLSearchParams({ userId });
  const res = await fetch(`${meerakBackendBase()}/api/jarvis/language-profile?${q}`, {
    cache: 'no-store',
    headers: upstreamAuthHeaders(authFromRequest(req)),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const res = await fetch(`${meerakBackendBase()}/api/jarvis/language-profile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...upstreamAuthHeaders(authFromRequest(req)),
      'Accept-Language': req.headers.get('accept-language') || '',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
