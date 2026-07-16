import { NextRequest, NextResponse } from 'next/server';
import { meerakBackendBase } from '@/lib/server-env';
import { upstreamAuthFromRequest, upstreamAuthHeaders } from '@/lib/server/upstreamAuth';

export async function GET(req: NextRequest) {
  const auth = upstreamAuthFromRequest(req);
  const riderId = req.nextUrl.searchParams.get('rider_id') || '';
  if (!riderId) return NextResponse.json({ error: 'rider_id required' }, { status: 400 });
  const base = meerakBackendBase();
  const res = await fetch(
    `${base}/api/rider-os/face/session?rider_id=${encodeURIComponent(riderId)}`,
    { headers: upstreamAuthHeaders(auth), cache: 'no-store' },
  );
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
