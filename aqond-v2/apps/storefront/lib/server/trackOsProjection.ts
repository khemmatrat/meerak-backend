import { getDispatchTracking } from '@/lib/server/dispatchSvc';
import { getRiderTracking } from '@/lib/server/riderTracking';
import { getOrderById } from '@/lib/server/orderStore';
import { getPackingProof } from '@/lib/server/packingProof';
import { getPickupVerification } from '@/lib/server/pickupVerification';
import { getConfirmState } from '@/lib/server/foodConfirmReceipt';
import { enrichTrackingWithConfirm } from '@/lib/server/foodConfirmReceipt';
import { getUnifiedOrderTimeline, type FoodTimelineEntry, type TimelineStep } from '@/lib/server/orderTimeline';
import { listShopChatMessages } from '@/lib/server/shopChatStore';
import { localListDispatchJobs } from '@/lib/server/localDispatch';

export type TrackOsProof = {
  kind: 'packing' | 'pickup' | 'delivery';
  label: string;
  url: string;
  at?: string;
  meta?: Record<string, unknown>;
};

export type TrackOsChatMessage = {
  id: string;
  from: string;
  text: string;
  at: string;
  image_url?: string;
};

export type TrackOsChatThread = {
  channel: 'customer_merchant' | 'merchant_rider' | 'customer_rider';
  peer_label: string;
  buyer_id: string;
  messages: TrackOsChatMessage[];
};

export type TrackOsProjection = {
  order_id: string;
  generated_at: string;
  order?: {
    merchant_id: string;
    buyer_id: string;
    fulfillment_status?: string;
    amount_micro?: number;
    payment_method?: string;
    delivered_at?: string;
  };
  phase: string;
  status_th?: string;
  tracking?: Record<string, unknown>;
  dispatch_job?: {
    id: string;
    rider_id?: string;
    phase?: string;
    status?: string;
    delivery_proof_url?: string;
    delivery_proof_at?: string;
  };
  timeline: {
    steps: TimelineStep[];
    food_timeline: FoodTimelineEntry[];
    dispatch_timeline: FoodTimelineEntry[];
    events: FoodTimelineEntry[];
  };
  proofs: TrackOsProof[];
  chats: TrackOsChatThread[];
  confirm?: Awaited<ReturnType<typeof getConfirmState>>;
  review?: {
    stars: number;
    comment?: string;
    tip_micro: number;
    submitted_at?: string;
  };
  rider?: {
    id?: string;
    name?: string;
    phone?: string;
    lat?: number;
    lng?: number;
  };
  gps?: {
    lat?: number;
    lng?: number;
    updated_at?: string;
  };
  audit_events: FoodTimelineEntry[];
  realtime_seq: number;
};

async function loadChats(
  merchantId: string,
  buyerId?: string,
  riderId?: string,
): Promise<TrackOsChatThread[]> {
  const threads: TrackOsChatThread[] = [];

  if (buyerId) {
    const customerMsgs = await listShopChatMessages(merchantId, buyerId);
    if (customerMsgs.length) {
      threads.push({
        channel: 'customer_merchant',
        peer_label: 'ลูกค้า ↔ ร้าน',
        buyer_id: buyerId,
        messages: customerMsgs.map((m) => ({
          id: m.id,
          from: m.from,
          text: m.text,
          at: m.created_at,
          image_url: m.image_url,
        })),
      });
    }
  }

  if (riderId) {
    const riderBuyerId = `rider:${riderId}`;
    const riderMsgs = await listShopChatMessages(merchantId, riderBuyerId);
    if (riderMsgs.length) {
      threads.push({
        channel: 'merchant_rider',
        peer_label: `ร้าน ↔ ไรเดอร์ (${riderId.slice(0, 8)})`,
        buyer_id: riderBuyerId,
        messages: riderMsgs.map((m) => ({
          id: m.id,
          from: m.from,
          text: m.text,
          at: m.created_at,
          image_url: m.image_url,
        })),
      });
    }
  }

  return threads;
}

function dedupeTimelineEntries(entries: FoodTimelineEntry[]): FoodTimelineEntry[] {
  const seen = new Set<string>();
  const out: FoodTimelineEntry[] = [];
  for (const e of entries) {
    const key = `${e.kind}:${e.event_type}:${e.at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

export async function buildTrackOsProjection(orderId: string): Promise<TrackOsProjection | null> {
  const order = await getOrderById(orderId);
  const rawTracking = (await getDispatchTracking(orderId)) || (await getRiderTracking(orderId));
  let tracking: Record<string, unknown> | undefined = rawTracking
    ? await enrichTrackingWithConfirm(orderId, { ...rawTracking })
    : undefined;

  const { jobs } = await localListDispatchJobs({});
  const dispatchJob = jobs.find((j) => j.order_id === orderId);

  const timelineRaw = await getUnifiedOrderTimeline(orderId);
  const mergedEvents = dedupeTimelineEntries([
    ...timelineRaw.food_timeline,
    ...timelineRaw.dispatch_timeline,
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()));

  const proofs: TrackOsProof[] = [];
  const packing = await getPackingProof(orderId);
  if (packing?.photo_url) {
    proofs.push({
      kind: 'packing',
      label: 'รูปแพ็คจากร้าน',
      url: packing.photo_url,
      at: packing.uploaded_at,
    });
  }
  const pickup = await getPickupVerification(orderId);
  if (pickup?.pickup_photo_url) {
    proofs.push({
      kind: 'pickup',
      label: 'รูปรับจากร้าน',
      url: pickup.pickup_photo_url,
      at: pickup.pickup_photo_at,
      meta: {
        verification_method: pickup.verification_method,
        verification_result: pickup.verification_result,
      },
    });
  }
  const deliveryUrl =
    (tracking?.delivery_photo_url as string | undefined) ||
    dispatchJob?.delivery_proof_url;
  if (deliveryUrl) {
    proofs.push({
      kind: 'delivery',
      label: 'รูปส่งมอบ',
      url: deliveryUrl,
      at: dispatchJob?.delivery_proof_at,
    });
  }

  const confirm = await getConfirmState(orderId);
  const reviewRaw = tracking?.review as TrackOsProjection['review'] | undefined;

  const merchantId = order?.merchant_id || (tracking?.merchant_id as string) || dispatchJob?.merchant_id || '';
  const buyerId = order?.buyer_id || (tracking?.buyer_id as string);
  const riderId =
    dispatchJob?.rider_id ||
    (tracking?.rider as { id?: string } | undefined)?.id ||
    undefined;

  const chats = merchantId ? await loadChats(merchantId, buyerId, riderId) : [];

  const riderProfile = tracking?.rider as { name?: string; phone?: string } | undefined;
  const phase = String(tracking?.phase || timelineRaw.steps.find((s) => s.active)?.key || 'unknown');

  return {
    order_id: orderId,
    generated_at: new Date().toISOString(),
    order: order
      ? {
          merchant_id: order.merchant_id,
          buyer_id: order.buyer_id,
          fulfillment_status: order.fulfillment_status,
          amount_micro: order.amount_micro,
          payment_method: order.method,
          delivered_at: order.delivered_at,
        }
      : undefined,
    phase,
    status_th: tracking?.status_th as string | undefined,
    tracking,
    dispatch_job: dispatchJob
      ? {
          id: dispatchJob.id,
          rider_id: dispatchJob.rider_id,
          phase: dispatchJob.phase,
          status: dispatchJob.status,
          delivery_proof_url: dispatchJob.delivery_proof_url,
          delivery_proof_at: dispatchJob.delivery_proof_at,
        }
      : undefined,
    timeline: {
      steps: timelineRaw.steps,
      food_timeline: timelineRaw.food_timeline,
      dispatch_timeline: timelineRaw.dispatch_timeline,
      events: mergedEvents,
    },
    proofs,
    chats,
    confirm: confirm || undefined,
    review: reviewRaw,
    rider: riderId
      ? {
          id: riderId,
          name: riderProfile?.name,
          phone: riderProfile?.phone,
          lat: dispatchJob?.dropoff_lat,
          lng: dispatchJob?.dropoff_lng,
        }
      : undefined,
    gps: dispatchJob?.rider_id
      ? {
          lat: dispatchJob.dropoff_lat,
          lng: dispatchJob.dropoff_lng,
          updated_at: dispatchJob.updated_at,
        }
      : undefined,
    audit_events: mergedEvents,
    realtime_seq: mergedEvents.length,
  };
}
