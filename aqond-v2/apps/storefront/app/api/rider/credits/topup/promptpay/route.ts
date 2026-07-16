import { NextRequest, NextResponse } from 'next/server';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';
import { proxyRiderCreditTopupPromptPay } from '@/lib/server/riderCreditTopupProxy';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const auth = upstreamAuthFromRequest(req);
  const amount = Number(body.amount ?? body.amount_thb);

  if (!(amount >= 1)) {
    return NextResponse.json({ error: 'amount required (min 1 THB)' }, { status: 400 });
  }

  const proxied = await proxyRiderCreditTopupPromptPay(auth, { amount, rider_id: body.rider_id });
  return NextResponse.json(proxied.data, { status: proxied.status || (proxied.ok ? 201 : 502) });
}
