import { NextRequest, NextResponse } from 'next/server';
import { meerakBackendBase } from '@/lib/server-env';
import { upstreamAuthFromRequest, upstreamAuthHeaders } from '@/lib/server/upstreamAuth';

/** Prefill rider signup from mobile KYC + compass category pack. */
export async function GET(req: NextRequest) {
  const userId =
    req.nextUrl.searchParams.get('userId') ||
    req.nextUrl.searchParams.get('user_id') ||
    '';
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }
  const auth = upstreamAuthFromRequest(req);
  try {
    const q = new URLSearchParams({ userId });
    const res = await fetch(`${meerakBackendBase()}/api/onboarding/compass-kyc-prefill?${q}`, {
      cache: 'no-store',
      headers: upstreamAuthHeaders({ ...auth, userId: auth.userId || userId }),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'backend_unavailable' }, { status: 503 });
  }
}
