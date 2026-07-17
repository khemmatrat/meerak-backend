import { NextRequest, NextResponse } from 'next/server';
import { submitDispatchReview } from '@/lib/server/dispatchSvc';
import { submitDeliveryReview } from '@/lib/server/riderTracking';
import { assertCustomerConfirmedForReview, enrichTrackingWithConfirm } from '@/lib/server/foodConfirmReceipt';

export async function POST(
  req: NextRequest,
  ctx: { params: { orderId: string } },
) {
  const orderId = ctx.params.orderId;
  const body = await req.json();
  const payload = {
    stars: Number(body.stars) || 5,
    comment: body.comment,
    tip_micro: Number(body.tip_micro) || 0,
  };

  const confirmed = await assertCustomerConfirmedForReview(orderId);
  if (!confirmed) {
    return NextResponse.json({ error: 'customer_confirm_required' }, { status: 409 });
  }

  const dispatch = await submitDispatchReview(orderId, payload);
  if (dispatch) {
    return NextResponse.json(await enrichTrackingWithConfirm(orderId, { ...dispatch }));
  }

  const tracking = await submitDeliveryReview(orderId, payload);
  if (!tracking) {
    return NextResponse.json({ error: 'tracking_not_found' }, { status: 404 });
  }
  return NextResponse.json(await enrichTrackingWithConfirm(orderId, { ...tracking }));
}