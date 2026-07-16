import { NextRequest, NextResponse } from 'next/server';
import { allowLocalOrders, dispatchApi } from '@/lib/server-env';
import { listLocalRiderCreditLedger } from '@/lib/server/localRiderCredits';
import { upstreamAuthFromRequest, upstreamAuthHeaders } from '@/lib/server/upstreamAuth';

export async function GET(req: NextRequest) {
  const riderId = req.nextUrl.searchParams.get('rider_id') || '';
  const userId = req.nextUrl.searchParams.get('user_id') || '';
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') || 40), 100);

  if (!riderId) {
    return NextResponse.json({ error: 'rider_id required' }, { status: 400 });
  }

  const auth = upstreamAuthFromRequest(req);
  const q = new URLSearchParams({ rider_id: riderId, limit: String(limit) });
  if (userId) q.set('user_id', userId);

  try {
    const res = await fetch(`${dispatchApi('/v1/dispatch/riders/me/credits')}?${q}`, {
      cache: 'no-store',
      headers: upstreamAuthHeaders(auth),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return NextResponse.json(data);
    if (allowLocalOrders()) {
      const ledger = await listLocalRiderCreditLedger(riderId, limit);
      return NextResponse.json({
        rider_id: riderId,
        user_id: userId || undefined,
        ...ledger,
      });
    }
    return NextResponse.json(data, { status: res.status });
  } catch (e: unknown) {
    if (allowLocalOrders()) {
      const ledger = await listLocalRiderCreditLedger(riderId, limit);
      return NextResponse.json({
        rider_id: riderId,
        user_id: userId || undefined,
        ...ledger,
      });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unreachable' },
      { status: 503 },
    );
  }
}
