import { NextRequest, NextResponse } from 'next/server';
import { proxyAdvanceJobDetail } from '@/lib/server/advanceJobProxy';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const auth = upstreamAuthFromRequest(req);
  const out = await proxyAdvanceJobDetail(id, auth);
  if (!out.ok) {
    return NextResponse.json(out.data, { status: out.status === 500 ? 502 : out.status });
  }
  return NextResponse.json(out.data);
}
