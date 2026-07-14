import { NextRequest, NextResponse } from 'next/server';
import { proxyAdvanceJobApplicants } from '@/lib/server/advanceJobProxy';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const auth = upstreamAuthFromRequest(req);
  const out = await proxyAdvanceJobApplicants(id, auth);
  if (!out.ok) {
    return NextResponse.json(
      { success: false, applicants: [] },
      { status: out.status === 500 ? 502 : out.status },
    );
  }
  return NextResponse.json(out.data);
}
