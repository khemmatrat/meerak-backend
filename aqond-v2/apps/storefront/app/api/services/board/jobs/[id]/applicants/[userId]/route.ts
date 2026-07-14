import { NextRequest, NextResponse } from 'next/server';
import { proxyPatchAdvanceApplicant } from '@/lib/server/advanceJobProxy';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';

type Ctx = { params: Promise<{ id: string; userId: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id, userId } = await ctx.params;
  const auth = upstreamAuthFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const out = await proxyPatchAdvanceApplicant(
    id,
    userId,
    {
      status: String(body.status || ''),
      agreed_amount: body.agreed_amount != null ? Number(body.agreed_amount) : undefined,
    },
    auth,
  );
  if (!out.ok) {
    return NextResponse.json(out.data, { status: out.status === 500 ? 502 : out.status });
  }
  return NextResponse.json(out.data);
}
