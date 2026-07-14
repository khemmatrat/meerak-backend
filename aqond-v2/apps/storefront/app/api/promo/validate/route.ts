import { NextRequest, NextResponse } from 'next/server';
import { fetchCouponCatalog, resolvePromoDiscount } from '@/lib/server/couponClient';
import { listPromoHints } from '@/lib/server/promoCodes';

export async function GET(req: NextRequest) {
  const context = req.nextUrl.searchParams.get('context') === 'food' ? 'food' : 'marketplace';
  const fromSvc = await fetchCouponCatalog();
  const hints = fromSvc.length > 0 ? fromSvc : listPromoHints(context);
  return NextResponse.json({ hints });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = await resolvePromoDiscount({
    user_id: body.user_id || body.buyer_id,
    code: body.code || '',
    subtotal_micro: Number(body.subtotal_micro) || 0,
    delivery_micro: Number(body.delivery_micro) || 0,
    context: body.context === 'food' ? 'food' : body.context === 'marketplace' ? 'marketplace' : 'any',
    payment_method: body.payment_method,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
