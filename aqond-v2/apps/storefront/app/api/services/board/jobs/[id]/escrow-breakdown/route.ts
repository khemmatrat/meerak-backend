import { NextRequest, NextResponse } from 'next/server';
import { proxyEscrowBreakdown } from '@/lib/server/advanceJobProxy';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const auth = upstreamAuthFromRequest(req);
  const amount = Number(req.nextUrl.searchParams.get('amount') || 0);
  const hasInsurance = req.nextUrl.searchParams.get('has_insurance') === 'true';
  if (!amount) {
    return NextResponse.json({ error: 'amount required' }, { status: 400 });
  }
  const out = await proxyEscrowBreakdown(id, amount, auth, hasInsurance);
  if (!out.ok) {
    return NextResponse.json(out.data, { status: out.status === 500 ? 502 : out.status });
  }
  return NextResponse.json(out.data);
}
