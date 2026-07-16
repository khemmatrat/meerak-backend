import { NextRequest, NextResponse } from 'next/server';
import { meerakBackendBase } from '@/lib/server-env';
import { upstreamAuthFromRequest, upstreamAuthHeaders } from '@/lib/server/upstreamAuth';

export async function POST(req: NextRequest) {
  const auth = upstreamAuthFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const base = meerakBackendBase();
  const res = await fetch(`${base}/api/rider-os/face/verify`, {
    method: 'POST',
    headers: upstreamAuthHeaders(auth),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
