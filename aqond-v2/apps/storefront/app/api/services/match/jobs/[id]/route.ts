import { NextRequest, NextResponse } from 'next/server';
import { proxyMatchJobDetail } from '@/lib/server/matchJobProxy';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const auth = upstreamAuthFromRequest(req);
  const out = await proxyMatchJobDetail(id, auth);
  return NextResponse.json(out.data, { status: out.status });
}
