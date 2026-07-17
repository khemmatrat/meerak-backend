import { NextRequest, NextResponse } from 'next/server';
import { getDispatchTracking } from '@/lib/server/dispatchSvc';
import { getRiderTracking } from '@/lib/server/riderTracking';
import { getUnifiedOrderTimeline } from '@/lib/server/orderTimeline';
import { getPackingProof } from '@/lib/server/packingProof';
import { attachPickupFieldsToTrack, getPickupVerification } from '@/lib/server/pickupVerification';
import {
  confirmDelivery,
  enrichTrackingWithConfirm,
  getConfirmState,
  isPostDeliveryPhase,
  markRiderDelivered,
} from '@/lib/server/foodConfirmReceipt';

async function attachProofs(orderId: string, view: Record<string, unknown>) {
  try {
    const packing = await getPackingProof(orderId);
    if (packing) {
      view.packing_proof_url = packing.photo_url;
      view.has_packing_proof = true;
    }
  } catch {
    /* optional */
  }
  try {
    const pickup = await getPickupVerification(orderId);
    attachPickupFieldsToTrack(view, pickup);
  } catch {
    /* optional */
  }
  return view;
}

async function buildTrackingResponse(orderId: string) {
  const dispatch = await getDispatchTracking(orderId);
  const base = dispatch || (await getRiderTracking(orderId));
  if (!base) return null;

  let view: Record<string, unknown> = { ...base };
  try {
    const { steps, events } = await getUnifiedOrderTimeline(orderId);
    if (steps.length) view.timeline = steps;
    if (events.length) view.lifecycle_events = events;
  } catch {
    /* optional */
  }
  view = await attachProofs(orderId, view);
  view = await enrichTrackingWithConfirm(orderId, view);
  return view;
}

export async function POST(
  req: NextRequest,
  ctx: { params: { orderId: string } },
) {
  const orderId = ctx.params.orderId;
  const body = await req.json().catch(() => ({}));
  const buyerId = typeof body.buyer_id === 'string' ? body.buyer_id : undefined;

  const dispatch = await getDispatchTracking(orderId);
  const sim = dispatch || (await getRiderTracking(orderId));
  if (!sim) {
    return NextResponse.json({ error: 'tracking_not_found' }, { status: 404 });
  }

  const phase = String(sim.phase || '');
  if (!isPostDeliveryPhase(phase)) {
    return NextResponse.json({ error: 'delivery_not_ready', phase }, { status: 409 });
  }

  let existing = await getConfirmState(orderId);
  if (!existing?.rider_delivered_at) {
    existing = await markRiderDelivered(orderId, buyerId || (sim as { buyer_id?: string }).buyer_id);
  }
  if (existing?.customer_confirmed_at) {
    const view = await buildTrackingResponse(orderId);
    return NextResponse.json(view);
  }

  try {
    await confirmDelivery(orderId, { buyerId, method: 'manual' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'confirm_failed';
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  const view = await buildTrackingResponse(orderId);
  if (!view) {
    return NextResponse.json({ error: 'tracking_not_found' }, { status: 404 });
  }
  return NextResponse.json(view);
}
