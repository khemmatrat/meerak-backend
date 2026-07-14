import { NextRequest, NextResponse } from 'next/server';
import { resolvePromoStack } from '@/lib/server/couponClient';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const codes = Array.isArray(body.codes) ? body.codes : [];
  const result = await resolvePromoStack({
    user_id: body.user_id || body.buyer_id,
    codes,
    subtotal_micro: Number(body.subtotal_micro) || 0,
    delivery_micro: Number(body.delivery_micro) || 0,
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    discount_micro: result.discount_micro,
    codes: result.codes,
    applied: result.applied,
    label: result.codes?.join(' + ') || '',
  });
}
