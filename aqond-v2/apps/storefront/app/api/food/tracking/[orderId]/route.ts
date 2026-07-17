import { NextRequest, NextResponse } from 'next/server';
import { getDispatchTracking, shouldUseDispatchFallback } from '@/lib/server/dispatchSvc';
import { getRiderTracking } from '@/lib/server/riderTracking';
import { getUnifiedOrderTimeline } from '@/lib/server/orderTimeline';
import { getPackingProof } from '@/lib/server/packingProof';
import { attachPickupFieldsToTrack, getPickupVerification } from '@/lib/server/pickupVerification';
import { enrichTrackingWithConfirm } from '@/lib/server/foodConfirmReceipt';
import { buildTrackOsProjection } from '@/lib/server/trackOsProjection';

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

async function withEventTimeline(orderId: string, view: Record<string, unknown>) {
  try {
    const { steps, events } = await getUnifiedOrderTimeline(orderId);
    if (steps.length) view.timeline = steps;
    if (events.length) view.lifecycle_events = events;
  } catch {
    /* optional */
  }
  return enrichTrackingWithConfirm(orderId, await attachProofs(orderId, view)).then(async (v) => {
    try {
      const proj = await buildTrackOsProjection(orderId);
      if (proj) {
        v.realtime_seq = proj.realtime_seq;
        v.proofs = proj.proofs;
        v.issues = proj.issues;
      }
    } catch {
      /* optional */
    }
    return v;
  });
}

export async function GET(
  _req: NextRequest,
  ctx: { params: { orderId: string } },
) {
  const orderId = ctx.params.orderId;
  const dispatch = await getDispatchTracking(orderId);
  if (dispatch) {
    return NextResponse.json(await withEventTimeline(orderId, { ...dispatch }));
  }

  const sim = await getRiderTracking(orderId);
  if (sim) {
    return NextResponse.json(await withEventTimeline(orderId, { ...sim }));
  }

  if (!shouldUseDispatchFallback()) {
    return NextResponse.json({ error: 'tracking_not_found', phase: 'merchant_pending' }, { status: 404 });
  }

  const { steps } = await getUnifiedOrderTimeline(orderId);
  if (steps.some((s) => s.done)) {
    return NextResponse.json(
      await withEventTimeline(orderId, {
        order_id: orderId,
        phase: steps.find((s) => s.active)?.key || 'merchant_pending',
        timeline: steps,
      }),
    );
  }

  return NextResponse.json({ error: 'tracking_not_found' }, { status: 404 });
}
