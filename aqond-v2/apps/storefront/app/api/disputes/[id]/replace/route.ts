import { NextRequest, NextResponse } from 'next/server';
import { createReplaceOrderForClaim } from '@/lib/server/claimReplace';

export async function POST(
  req: NextRequest,
  ctx: { params: { id: string } },
) {
  const body = await req.json().catch(() => ({}));
  const result = await createReplaceOrderForClaim(ctx.params.id, body.actor || 'admin');
  if (!result) return NextResponse.json({ error: 'replace_failed' }, { status: 404 });
  return NextResponse.json({ ok: true, case: result });
}
