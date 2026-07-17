import { NextRequest, NextResponse } from 'next/server';
import { redispatchClaim } from '@/lib/server/claimRedispatch';

export async function POST(
  req: NextRequest,
  ctx: { params: { id: string } },
) {
  const body = await req.json().catch(() => ({}));
  const result = await redispatchClaim(ctx.params.id, body.actor || 'admin');
  if (!result) return NextResponse.json({ error: 'redispatch_failed' }, { status: 404 });
  return NextResponse.json({ ok: true, case: result });
}
