import { NextRequest, NextResponse } from 'next/server';
import { getDispatchTracking, shouldUseDispatchFallback } from '@/lib/server/dispatchSvc';
import { getRiderTracking } from '@/lib/server/riderTracking';
import { getUnifiedOrderTimeline } from '@/lib/server/orderTimeline';

async function withEventTimeline(orderId: string, view: Record<string, unknown>) {
  try {
    const { steps, events } = await getUnifiedOrderTimeline(orderId);
    if (steps.length) view.timeline = steps;
    if (events.length) view.lifecycle_events = events;
  } catch {
    /* optional */
  }
  return view;
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
