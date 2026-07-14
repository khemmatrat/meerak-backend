import { NextRequest, NextResponse } from 'next/server';
import { proxyPostAdvanceEscrow } from '@/lib/server/advanceJobProxy';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const auth = upstreamAuthFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const amount = Number(body.amount || 0);
  if (!amount) {
    return NextResponse.json({ success: false, error: 'amount required' }, { status: 400 });
  }
  const out = await proxyPostAdvanceEscrow(id, amount, auth);
  if (!out.ok) {
    return NextResponse.json(out.data, { status: out.status === 500 ? 502 : out.status });
  }
  return NextResponse.json(out.data);
}
