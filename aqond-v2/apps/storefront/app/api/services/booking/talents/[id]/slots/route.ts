import { NextRequest, NextResponse } from 'next/server';
import { proxyTalentSlots } from '@/lib/server/bookingProxy';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const auth = upstreamAuthFromRequest(req);
  const out = await proxyTalentSlots(id, auth);
  if (!out.ok) return NextResponse.json({ slots: [] }, { status: out.status === 500 ? 502 : 200 });
  return NextResponse.json(out.data);
}
