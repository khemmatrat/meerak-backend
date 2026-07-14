import { NextRequest, NextResponse } from 'next/server';
import { dispatchApi } from '@/lib/server-env';
import { upstreamAuthFromRequest, upstreamAuthHeaders } from '@/lib/server/upstreamAuth';

/** Deprecated for client misuse — only links when rider has no owner yet. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const riderId = body.rider_id;
  const userId = body.user_id;
  if (!riderId || !userId) {
    return NextResponse.json({ error: 'rider_id and user_id required' }, { status: 400 });
  }
  const auth = upstreamAuthFromRequest(req);
  const callerId = auth.userId || req.headers.get('x-user-id') || '';
  if (callerId && callerId !== userId) {
    return NextResponse.json({ error: 'user_mismatch' }, { status: 403 });
  }
  try {
    const meRes = await fetch(`${dispatchApi('/v1/dispatch/riders/me')}?user_id=${encodeURIComponent(userId)}`, {
      cache: 'no-store',
      headers: upstreamAuthHeaders({ ...auth, userId }),
    });
    if (meRes.ok) {
      const me = await meRes.json().catch(() => ({}));
      if (me.rider_id && me.rider_id !== riderId) {
        return NextResponse.json(
          { error: 'user_already_has_rider', message: 'บัญชีนี้มีผู้ให้บริการแล้ว — 1 บัญชีต่อ 1 คน' },
          { status: 409 },
        );
      }
    }
    const res = await fetch(dispatchApi(`/v1/dispatch/riders/${encodeURIComponent(riderId)}/link-user`), {
      method: 'POST',
      headers: upstreamAuthHeaders({ ...auth, userId: auth.userId || userId }),
      body: JSON.stringify({ user_id: userId }),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'dispatch_unavailable' }, { status: 503 });
  }
}
