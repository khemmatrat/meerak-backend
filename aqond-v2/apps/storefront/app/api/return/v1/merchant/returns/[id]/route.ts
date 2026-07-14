import { NextRequest, NextResponse } from 'next/server';
import { merchantRespondToReturn } from '@/lib/server/returnService';

export const dynamic = 'force-dynamic';

/** Merchant approve/reject a return request. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const returnId = params.id;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const merchantId = String(body.merchant_id || '');
  const action = body.action === 'reject' ? 'reject' : body.action === 'approve' ? 'approve' : '';
  if (!merchantId || !action) {
    return NextResponse.json({ ok: false, error: 'missing_fields' }, { status: 400 });
  }

  try {
    const result = await merchantRespondToReturn({
      return_id: returnId,
      merchant_id: merchantId,
      action,
      note: body.note ? String(body.note) : undefined,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'respond_failed';
    const status = msg === 'forbidden' ? 403 : msg === 'return_not_found' ? 404 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
