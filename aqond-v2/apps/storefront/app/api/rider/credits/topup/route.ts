import { NextRequest, NextResponse } from 'next/server';
import { allowLocalOrders } from '@/lib/server-env';
import { topupRiderCredit } from '@/lib/server/riderCreditLine';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';
import { proxyRiderCreditTopupWallet } from '@/lib/server/riderCreditTopupProxy';

/** @deprecated use /api/rider/credits/topup/wallet or /promptpay */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const auth = upstreamAuthFromRequest(req);
  const riderId = String(body.rider_id || '');
  const amountMicro = Math.round(Number(body.amount_micro || 0));

  if (!riderId || amountMicro <= 0) {
    return NextResponse.json({ error: 'rider_id and amount_micro required' }, { status: 400 });
  }

  const proxied = await proxyRiderCreditTopupWallet(auth, {
    rider_id: riderId,
    amount_micro: amountMicro,
  });
  if (proxied.ok) return NextResponse.json(proxied.data);

  if (allowLocalOrders() && proxied.status >= 500) {
    const summary = await topupRiderCredit({
      rider_id: riderId,
      user_id: auth.userId || '',
      amount_micro: amountMicro,
      reason: 'Dev fallback topup',
      actor_type: 'rider',
      actor_id: riderId,
    });
    return NextResponse.json({ ok: true, summary, warning: 'dev_fallback' });
  }

  return NextResponse.json(proxied.data, { status: proxied.status || 502 });
}
