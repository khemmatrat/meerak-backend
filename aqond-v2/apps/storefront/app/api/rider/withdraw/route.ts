import { NextRequest, NextResponse } from 'next/server';
import { dispatchApi } from '@/lib/server-env';
import { upstreamAuthFromRequest, upstreamAuthHeaders } from '@/lib/server/upstreamAuth';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const auth = upstreamAuthFromRequest(req);
  try {
    const res = await fetch(dispatchApi('/v1/dispatch/riders/me/withdraw'), {
      method: 'POST',
      headers: upstreamAuthHeaders(auth),
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data);
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unreachable' }, { status: 503 });
  }
}
