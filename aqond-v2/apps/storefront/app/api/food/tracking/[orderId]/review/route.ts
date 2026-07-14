import { NextRequest, NextResponse } from 'next/server';
import { submitDispatchReview } from '@/lib/server/dispatchSvc';
import { submitDeliveryReview } from '@/lib/server/riderTracking';

export async function POST(
  req: NextRequest,
  ctx: { params: { orderId: string } },
) {
  const body = await req.json();
  const payload = {
    stars: Number(body.stars) || 5,
    comment: body.comment,
    tip_micro: Number(body.tip_micro) || 0,
  };
  const dispatch = await submitDispatchReview(ctx.params.orderId, payload);
  if (dispatch) return NextResponse.json(dispatch);

  const tracking = await submitDeliveryReview(ctx.params.orderId, payload);
  if (!tracking) {
    return NextResponse.json({ error: 'tracking_not_found' }, { status: 404 });
  }
  return NextResponse.json(tracking);
}