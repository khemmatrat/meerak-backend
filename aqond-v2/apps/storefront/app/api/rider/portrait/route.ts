import { NextRequest, NextResponse } from 'next/server';
import { meerakBackendBase } from '@/lib/server-env';
import { upstreamAuthFromRequest, upstreamAuthHeaders } from '@/lib/server/upstreamAuth';

/** GET verified KYC selfie for rider profile display */
export async function GET(req: NextRequest) {
  const auth = upstreamAuthFromRequest(req);
  const userId = req.nextUrl.searchParams.get('user_id') || auth.userId || '';
  if (!userId) {
    return NextResponse.json({ error: 'user_id required' }, { status: 400 });
  }
  const base = meerakBackendBase();
  const res = await fetch(`${base}/api/rider-os/kyc/portrait`, {
    headers: upstreamAuthHeaders({ ...auth, userId }),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
