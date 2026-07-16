import { NextRequest, NextResponse } from 'next/server';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';
import { proxyRiderCreditTopupStatus } from '@/lib/server/riderCreditTopupProxy';

type Ctx = { params: Promise<{ chargeId: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { chargeId } = await ctx.params;
  const auth = upstreamAuthFromRequest(req);
  if (!chargeId) {
    return NextResponse.json({ error: 'chargeId required' }, { status: 400 });
  }

  const proxied = await proxyRiderCreditTopupStatus(auth, chargeId);
  return NextResponse.json(proxied.data, { status: proxied.status || (proxied.ok ? 200 : 502) });
}
