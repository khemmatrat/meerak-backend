import { NextRequest, NextResponse } from 'next/server';
import { proxyPayBookingDeposit } from '@/lib/server/bookingProxy';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const auth = upstreamAuthFromRequest(req);
  const out = await proxyPayBookingDeposit(id, auth);
  if (!out.ok) {
    return NextResponse.json(out.data, { status: out.status === 500 ? 502 : out.status });
  }
  return NextResponse.json(out.data);
}
