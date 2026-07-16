import { NextRequest, NextResponse } from 'next/server';
import { dispatchApi, allowLocalOrders } from '@/lib/server-env';
import { getLocalRiderCreditSummary, listLocalRiderCreditLedger } from '@/lib/server/localRiderCredits';

export async function GET(req: NextRequest) {
  const riderId = req.nextUrl.searchParams.get('rider_id') || '';
  const userId = req.nextUrl.searchParams.get('user_id') || '';
  const q = new URLSearchParams();
  if (riderId) q.set('rider_id', riderId);
  if (userId) q.set('user_id', userId);
  try {
    const res = await fetch(`${dispatchApi('/v1/dispatch/riders/me/earnings')}?${q}`, {
      cache: 'no-store',
      headers: { 'X-Aqond-Region': 'TH' },
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return NextResponse.json(data);
    if (allowLocalOrders() && riderId) {
      const summary = await getLocalRiderCreditSummary(riderId, userId);
      return NextResponse.json({
        rider_id: riderId,
        earnings_micro: summary.earned_micro,
        withdrawable_micro: summary.withdrawable_micro,
        balance_micro: summary.balance_micro,
        pending_withdraw_micro: summary.pending_withdraw_micro,
        completed_jobs: summary.completed_jobs,
        kyc_status: 'approved',
        source: summary.source,
      });
    }
    return NextResponse.json(data, { status: res.status });
  } catch (e: unknown) {
    if (allowLocalOrders() && riderId) {
      const summary = await getLocalRiderCreditSummary(riderId, userId);
      return NextResponse.json({
        rider_id: riderId,
        earnings_micro: summary.earned_micro,
        withdrawable_micro: summary.withdrawable_micro,
        balance_micro: summary.balance_micro,
        pending_withdraw_micro: summary.pending_withdraw_micro,
        completed_jobs: summary.completed_jobs,
        kyc_status: 'approved',
        source: summary.source,
      });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unreachable' }, { status: 503 });
  }
}

export { listLocalRiderCreditLedger };
