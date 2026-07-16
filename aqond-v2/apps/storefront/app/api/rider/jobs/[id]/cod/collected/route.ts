import { NextRequest, NextResponse } from 'next/server';
import { proxyRiderCodCollected } from '@/lib/server/riderCodProxy';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const auth = upstreamAuthFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const { ok, status, data } = await proxyRiderCodCollected(auth, id, {
    amount_micro: body.amount_micro ?? body.amountMicro,
    method: body.method,
    photo_url: body.photo_url || body.photoUrl,
  });
  return NextResponse.json(data, { status: ok ? 200 : status || 503 });
}
