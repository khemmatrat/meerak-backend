import { NextRequest, NextResponse } from 'next/server';
import { meerakBackendBase } from '@/lib/server-env';
import { upstreamAuthFromRequest, upstreamAuthHeaders } from '@/lib/server/upstreamAuth';

export async function POST(req: NextRequest) {
  const auth = upstreamAuthFromRequest(req);
  const body = await req.json().catch(() => ({}));

  try {
    const res = await fetch(`${meerakBackendBase()}/api/subscriptions/checkout-799`, {
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
