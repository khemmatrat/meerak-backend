import { NextRequest, NextResponse } from 'next/server';
import { meerakBackendBase } from '@/lib/server-env';
import { upstreamAuthFromRequest, upstreamAuthHeaders } from '@/lib/server/upstreamAuth';

export async function GET(req: NextRequest) {
  const auth = upstreamAuthFromRequest(req);
  const base = meerakBackendBase();
  const res = await fetch(`${base}/api/rider-os/kyc/status`, {
    headers: upstreamAuthHeaders(auth),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
