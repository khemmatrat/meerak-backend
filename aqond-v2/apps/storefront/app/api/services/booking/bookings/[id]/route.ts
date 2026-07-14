import { NextRequest, NextResponse } from 'next/server';
import { proxyPatchBooking } from '@/lib/server/bookingProxy';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const auth = upstreamAuthFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const out = await proxyPatchBooking(id, body as Record<string, unknown>, auth);
  if (!out.ok) {
    return NextResponse.json(out.data, { status: out.status === 500 ? 502 : out.status });
  }
  return NextResponse.json(out.data);
}
