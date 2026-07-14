import { NextRequest, NextResponse } from 'next/server';
import { dispatchApi } from '@/lib/server-env';
import { upstreamAuthFromRequest, upstreamAuthHeaders } from '@/lib/server/upstreamAuth';

/** GET dispatch rider profile by user_id (for partner hub status). */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('user_id') || '';
  if (!userId) {
    return NextResponse.json({ error: 'user_id required' }, { status: 400 });
  }
  const auth = upstreamAuthFromRequest(req);
  try {
    const q = new URLSearchParams({ user_id: userId });
    const res = await fetch(`${dispatchApi('/v1/dispatch/riders/me')}?${q}`, {
      cache: 'no-store',
      headers: upstreamAuthHeaders({ ...auth, userId: auth.userId || userId }),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'dispatch_unavailable' }, { status: 503 });
  }
}
