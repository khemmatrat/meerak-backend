import { NextRequest, NextResponse } from 'next/server';
import { allowLocalOrders, dispatchApi } from '@/lib/server-env';
import { createLocalRiderWithdraw } from '@/lib/server/localRiderCredits';
import { upstreamAuthFromRequest, upstreamAuthHeaders } from '@/lib/server/upstreamAuth';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const auth = upstreamAuthFromRequest(req);
  try {
    const res = await fetch(dispatchApi('/v1/dispatch/riders/me/withdraw'), {
      method: 'POST',
      headers: upstreamAuthHeaders(auth),
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return NextResponse.json(data);
    if (allowLocalOrders() && body.rider_id) {
      try {
        const { getLocalRiderCreditSummary } = await import('@/lib/server/localRiderCredits');
        const summary = await getLocalRiderCreditSummary(String(body.rider_id), auth.userId || body.user_id);
        const amountMicro = Number(body.amount_micro) > 0
          ? Number(body.amount_micro)
          : summary.withdrawable_micro;
        if (!amountMicro || amountMicro <= 0) {
          return NextResponse.json({ error: 'insufficient_rider_balance' }, { status: 400 });
        }
        const local = await createLocalRiderWithdraw({
          rider_id: String(body.rider_id),
          user_id: auth.userId || body.user_id,
          amount_micro: amountMicro,
          bank_account: body.bank_account,
          idempotency_key: body.idempotency_key,
        });
        return NextResponse.json({
          ok: true,
          payout_id: local.payout_id,
          status: local.status,
          source: 'local-rider-credits',
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'withdraw_failed';
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    }
    return NextResponse.json(data, { status: res.status });
  } catch (e: unknown) {
    if (allowLocalOrders() && body.rider_id) {
      try {
        const { getLocalRiderCreditSummary } = await import('@/lib/server/localRiderCredits');
        const summary = await getLocalRiderCreditSummary(String(body.rider_id), auth.userId || body.user_id);
        const amountMicro = Number(body.amount_micro) > 0
          ? Number(body.amount_micro)
          : summary.withdrawable_micro;
        if (!amountMicro || amountMicro <= 0) {
          return NextResponse.json({ error: 'insufficient_rider_balance' }, { status: 400 });
        }
        const local = await createLocalRiderWithdraw({
          rider_id: String(body.rider_id),
          user_id: auth.userId || body.user_id,
          amount_micro: amountMicro,
          bank_account: body.bank_account,
          idempotency_key: body.idempotency_key,
        });
        return NextResponse.json({
          ok: true,
          payout_id: local.payout_id,
          status: local.status,
          source: 'local-rider-credits',
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'withdraw_failed';
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unreachable' }, { status: 503 });
  }
}
