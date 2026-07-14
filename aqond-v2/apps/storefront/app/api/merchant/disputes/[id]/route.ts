import { NextRequest, NextResponse } from 'next/server';
import { getDisputeCase, merchantRespondToDispute } from '@/lib/server/merchantDisputes';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const c = await getDisputeCase(params.id);
  if (!c) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ case: c });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const updated = await merchantRespondToDispute(params.id, {
    response: body.response || '',
    accept_platform: !!body.accept_platform,
    propose_mutual: !!body.propose_mutual,
    mutual_refund_micro: body.mutual_refund_micro,
  });
  if (!updated) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true, case: updated });
}
