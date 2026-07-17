import fs from 'fs/promises';
import path from 'path';
import { foodItemImageUrl } from '@/lib/foodVisual';
import { getOrderById } from '@/lib/server/orderStore';

const SESSIONS_FILE = path.join(process.cwd(), '.data', 'dev', 'rider-sessions.json');

/** Full delivery lifecycle for food orders (demo simulation). */
export type DeliveryPhase =
  | 'merchant_pending'
  | 'merchant_accepted'
  | 'merchant_preparing'
  | 'finding_rider'
  | 'rider_assigned'
  | 'food_ready'
  | 'rider_picked_up'
  | 'en_route'
  | 'approaching'
  | 'arrived'
  | 'rider_calling'
  | 'photo_proof'
  | 'handoff'
  | 'cod_payment'
  | 'rider_completed'
  | 'awaiting_customer_confirm'
  | 'review_pending'
  | 'completed';

export type RiderPoint = { lat: number; lng: number };

export type RiderProfile = {
  name: string;
  phone: string;
  vehicle: string;
  plate: string;
  avatar_url: string;
  rating: number;
  review_count: number;
  grade: string;
};

export type DeliveryReview = {
  stars: number;
  comment?: string;
  tip_micro: number;
  submitted_at: string;
};

export type DeliveryReport = {
  type: 'wrong_order' | 'missing_items' | 'quality' | 'other';
  note?: string;
  submitted_at: string;
};

export type ChatMessage = {
  from: 'rider' | 'customer';
  text: string;
  at: string;
  image_url?: string;
  kind?: 'text' | 'image';
};

export type TrackingOrderItem = {
  item_id: string;
  title: string;
  qty: number;
  unit_price_micro: number;
  image_url?: string;
};

export type RiderSession = {
  order_id: string;
  buyer_id: string;
  merchant_id: string;
  merchant_name: string;
  items_summary: string;
  order_items?: TrackingOrderItem[];
  address: string;
  handoff_note?: string;
  eta_label: string;
  payment_method: string;
  amount_micro: number;
  started_at: string;
  restaurant: RiderPoint & { name: string };
  destination: RiderPoint;
  rider: RiderProfile;
  review?: DeliveryReview;
  report?: DeliveryReport;
  points_earned?: number;
  chat_messages: ChatMessage[];
  delivery_photo_url: string;
};

export type TimelineStep = {
  id: string;
  label: string;
  done: boolean;
  active: boolean;
};

export type RiderTrackingView = RiderSession & {
  phase: DeliveryPhase;
  progress: number;
  rider_pos: RiderPoint;
  status_th: string;
  status_detail?: string;
  minutes_left: number;
  delivered: boolean;
  show_rider: boolean;
  show_rider_profile: boolean;
  timeline: TimelineStep[];
  active_events: string[];
  can_review: boolean;
  can_confirm?: boolean;
  customer_confirmed_at?: string;
  auto_confirm_at?: string;
  confirm_method?: 'manual' | 'auto';
  rider_delivered_at?: string;
  can_chat: boolean;
  order_items: TrackingOrderItem[];
  item_count: number;
  packing_proof_url?: string;
  has_packing_proof?: boolean;
  pickup_photo_url?: string;
  pickup_verified_at?: string;
  pickup_verified_by?: string;
  verification_method?: string;
  pickup_completed_at?: string;
};

const PHASE_LABEL: Record<DeliveryPhase, string> = {
  merchant_pending: 'รอร้านรับออเดอร์',
  merchant_accepted: 'ร้านรับออเดอร์แล้ว',
  merchant_preparing: 'ร้านกำลังเตรียมอาหาร',
  finding_rider: 'กำลังหาไรเดอร์',
  rider_assigned: 'พบไรเดอร์แล้ว',
  food_ready: 'อาหารพร้อมส่ง',
  rider_picked_up: 'ไรเดอร์รับอาหารแล้ว',
  en_route: 'ไรเดอร์กำลังนำมาส่ง',
  approaching: 'ใกล้ถึงคุณแล้ว',
  arrived: 'ไรเดอร์มาถึงแล้ว',
  rider_calling: 'ไรเดอร์กำลังโทรหา',
  photo_proof: 'ไรเดอร์ถ่ายรูปส่งมอบ',
  handoff: 'ส่งมอบตามนัดหมาย',
  cod_payment: 'ชำระเงินสดเรียบร้อย',
  rider_completed: 'ไรเดอร์ส่งงานสำเร็จ',
  awaiting_customer_confirm: 'ยืนยันการรับอาหาร',
  review_pending: 'ให้คะแนนและทิปไรเดอร์',
  completed: 'ขอบคุณที่อุดหนุน',
};

/** Timeline segments in ms from order start */
const T = {
  merchantPending: 3_500,
  merchantAccepted: 5_000,
  preparing: 22_000,
  findingRider: 16_000,
  riderAssigned: 18_000,
  foodReady: 28_000,
  pickedUp: 32_000,
  travelEnd: 88_000,
  approaching: 80_000,
  arrived: 90_000,
  calling: 92_000,
  photo: 94_000,
  handoff: 96_000,
  cod: 98_000,
  riderDone: 100_000,
};

const DEMO_RIDER: RiderProfile = {
  name: 'คุณบีม',
  phone: '081-234-5678',
  vehicle: '🛵',
  plate: '1กข 9284',
  avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&h=120&fit=crop',
  rating: 4.92,
  review_count: 1847,
  grade: 'A+',
};

const DELIVERY_PHOTO =
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop';

type Store = Record<string, RiderSession>;

async function readStore(): Promise<Store> {
  try {
    return JSON.parse(await fs.readFile(SESSIONS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

async function writeStore(store: Store) {
  await fs.mkdir(path.dirname(SESSIONS_FILE), { recursive: true });
  await fs.writeFile(SESSIONS_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function isCod(method: string) {
  return method === 'cod' || !method;
}

function computePhaseState(
  elapsedMs: number,
  session: RiderSession,
  hasReview: boolean,
): {
  phase: DeliveryPhase;
  progress: number;
  rider_pos: RiderPoint;
  delivered: boolean;
  show_rider: boolean;
  show_rider_profile: boolean;
  status_detail?: string;
  active_events: string[];
} {
  const { restaurant, destination } = session;
  const cod = isCod(session.payment_method);

  if (hasReview) {
    return {
      phase: 'completed',
      progress: 1,
      rider_pos: destination,
      delivered: true,
      show_rider: true,
      show_rider_profile: true,
      status_detail: `ได้รับ ${session.points_earned || 0} คะแนน — ใช้เป็นส่วนลดรอบหน้า`,
      active_events: [],
    };
  }

  if (elapsedMs >= T.riderDone) {
    return {
      phase: 'review_pending',
      progress: 1,
      rider_pos: destination,
      delivered: true,
      show_rider: true,
      show_rider_profile: true,
      status_detail: 'ให้คะแนนไรเดอร์และทิป (ถ้าต้องการ)',
      active_events: ['ส่งมอบสำเร็จแล้ว'],
    };
  }

  if (elapsedMs >= T.handoff) {
    if (!cod && elapsedMs >= T.riderDone - 2_000) {
      return {
        phase: 'rider_completed',
        progress: 0.99,
        rider_pos: destination,
        delivered: false,
        show_rider: true,
        show_rider_profile: true,
        status_detail: 'ไรเดอร์กดส่งงานสำเร็จ',
        active_events: ['ชำระออนไลน์แล้ว — ส่งมอบเรียบร้อย'],
      };
    }
    if (cod && elapsedMs >= T.cod) {
      return {
        phase: 'cod_payment',
        progress: 0.98,
        rider_pos: destination,
        delivered: false,
        show_rider: true,
        show_rider_profile: true,
        status_detail: 'กรุณาชำระเงินสดให้ไรเดอร์',
        active_events: ['ชำระเงินสด'],
      };
    }
    return {
      phase: 'handoff',
      progress: 0.96,
      rider_pos: destination,
      delivered: false,
      show_rider: true,
      show_rider_profile: true,
      status_detail: session.handoff_note || 'ส่งมอบตามที่ระบุ',
      active_events: ['ส่งมอบอาหาร'],
    };
  }

  if (elapsedMs >= T.photo) {
    return {
      phase: 'photo_proof',
      progress: 0.94,
      rider_pos: destination,
      delivered: false,
      show_rider: true,
      show_rider_profile: true,
      status_detail: 'ถ่ายรูปหลักฐานการส่ง',
      active_events: ['ถ่ายรูปส่งมอบ'],
    };
  }

  if (elapsedMs >= T.calling) {
    return {
      phase: 'rider_calling',
      progress: 0.92,
      rider_pos: destination,
      delivered: false,
      show_rider: true,
      show_rider_profile: true,
      status_detail: `โทร ${session.rider.phone}`,
      active_events: ['ไรเดอร์โทรหา'],
    };
  }

  if (elapsedMs >= T.arrived) {
    return {
      phase: 'arrived',
      progress: 0.9,
      rider_pos: destination,
      delivered: false,
      show_rider: true,
      show_rider_profile: true,
      status_detail: 'ไรเดอร์อยู่หน้าประตูแล้ว',
      active_events: ['มาถึงแล้ว'],
    };
  }

  if (elapsedMs >= T.pickedUp) {
    const travelElapsed = elapsedMs - T.pickedUp;
    const travelTotal = T.travelEnd - T.pickedUp;
    const t = Math.min(1, travelElapsed / travelTotal);
    const rider_pos = {
      lat: lerp(restaurant.lat, destination.lat, t),
      lng: lerp(restaurant.lng, destination.lng, t),
    };

    if (elapsedMs >= T.approaching) {
      return {
        phase: 'approaching',
        progress: 0.7 + t * 0.2,
        rider_pos,
        delivered: false,
        show_rider: true,
        show_rider_profile: true,
        status_detail: 'อีกไม่กี่นาทีถึงคุณ',
        active_events: ['ใกล้ถึงแล้ว'],
      };
    }

    return {
      phase: 'en_route',
      progress: 0.4 + t * 0.35,
      rider_pos,
      delivered: false,
      show_rider: true,
      show_rider_profile: true,
      status_detail: 'กำลังเดินทางมาหาคุณ',
      active_events: ['กำลังนำมาส่ง'],
    };
  }

  if (elapsedMs >= T.foodReady) {
    return {
      phase: 'rider_picked_up',
      progress: 0.38,
      rider_pos: restaurant,
      delivered: false,
      show_rider: true,
      show_rider_profile: true,
      status_detail: 'ไรเดอร์กำลังรับอาหารจากร้าน',
      active_events: ['รับอาหารจากร้าน'],
    };
  }

  if (elapsedMs >= T.foodReady - 2_000) {
    return {
      phase: 'food_ready',
      progress: 0.35,
      rider_pos: restaurant,
      delivered: false,
      show_rider: true,
      show_rider_profile: true,
      status_detail: 'ร้านทำอาหารเสร็จแล้ว',
      active_events: ['อาหารพร้อม'],
    };
  }

  if (elapsedMs >= T.riderAssigned) {
    return {
      phase: 'rider_assigned',
      progress: 0.25,
      rider_pos: restaurant,
      delivered: false,
      show_rider: true,
      show_rider_profile: true,
      status_detail: `${session.rider.name} · ${session.rider.plate}`,
      active_events: ['พบไรเดอร์'],
    };
  }

  if (elapsedMs >= T.preparing && elapsedMs < T.riderAssigned) {
    return {
      phase: 'finding_rider',
      progress: 0.15,
      rider_pos: restaurant,
      delivered: false,
      show_rider: false,
      show_rider_profile: false,
      status_detail: 'กำลังจับคู่ไรเดอร์ที่ใกล้ที่สุด',
      active_events: ['หาไรเดอร์'],
    };
  }

  if (elapsedMs >= T.merchantAccepted) {
    return {
      phase: 'merchant_preparing',
      progress: 0.1,
      rider_pos: restaurant,
      delivered: false,
      show_rider: false,
      show_rider_profile: false,
      status_detail: session.merchant_name,
      active_events: ['เตรียมอาหาร'],
    };
  }

  if (elapsedMs >= T.merchantPending) {
    return {
      phase: 'merchant_accepted',
      progress: 0.05,
      rider_pos: restaurant,
      delivered: false,
      show_rider: false,
      show_rider_profile: false,
      status_detail: 'ร้านยืนยันรับออเดอร์แล้ว',
      active_events: ['รับออเดอร์'],
    };
  }

  return {
    phase: 'merchant_pending',
    progress: 0.02,
    rider_pos: restaurant,
    delivered: false,
    show_rider: false,
    show_rider_profile: false,
    status_detail: 'รอร้านกดรับออเดอร์',
    active_events: [],
  };
}

function buildTimeline(phase: DeliveryPhase): TimelineStep[] {
  const order: Array<{ id: string; label: string; phases: DeliveryPhase[] }> = [
    { id: 'shop', label: 'ร้านรับออเดอร์', phases: ['merchant_pending', 'merchant_accepted'] },
    { id: 'prep', label: 'เตรียมอาหาร', phases: ['merchant_preparing'] },
    { id: 'find', label: 'หาไรเดอร์', phases: ['finding_rider', 'rider_assigned'] },
    { id: 'pickup', label: 'ไรเดอร์รับอาหาร', phases: ['food_ready', 'rider_picked_up'] },
    { id: 'deliver', label: 'นำมาส่ง', phases: ['en_route', 'approaching'] },
    { id: 'arrive', label: 'ถึงที่หมาย', phases: ['arrived', 'rider_calling', 'photo_proof', 'handoff', 'cod_payment'] },
    { id: 'done', label: 'เสร็จสิ้น', phases: ['rider_completed', 'awaiting_customer_confirm', 'review_pending', 'completed'] },
  ];

  const phaseIdx = (p: DeliveryPhase) => {
    const all: DeliveryPhase[] = [
      'merchant_pending', 'merchant_accepted', 'merchant_preparing', 'finding_rider', 'rider_assigned',
      'food_ready', 'rider_picked_up', 'en_route', 'approaching', 'arrived', 'rider_calling',
      'photo_proof', 'handoff', 'cod_payment', 'rider_completed', 'awaiting_customer_confirm', 'review_pending', 'completed',
    ];
    return all.indexOf(p);
  };
  const current = phaseIdx(phase);

  return order.map((step) => {
    const stepMax = Math.max(...step.phases.map(phaseIdx));
    const stepMin = Math.min(...step.phases.map(phaseIdx));
    const active = step.phases.includes(phase);
    const done = current > stepMax;
    return { id: step.id, label: step.label, done, active };
  });
}

async function resolveOrderItems(session: RiderSession): Promise<TrackingOrderItem[]> {
  if (session.order_items?.length) {
    return session.order_items.map((it) => ({
      ...it,
      image_url: it.image_url || foodItemImageUrl(it.item_id, it.title),
    }));
  }

  const stored = await getOrderById(session.order_id);
  if (stored?.items?.length) {
    return stored.items.map((it) => ({
      item_id: it.product_id,
      title: it.title || it.product_id,
      qty: it.qty || 1,
      unit_price_micro: it.unit_price_micro || 0,
      image_url: foodItemImageUrl(it.product_id, it.title),
    }));
  }

  if (session.items_summary?.trim()) {
    return session.items_summary.split(/[,·]/).map((raw, i) => {
      const title = raw.trim();
      if (!title) return null;
      return {
        item_id: `summary-${i}`,
        title,
        qty: 1,
        unit_price_micro: 0,
        image_url: foodItemImageUrl(undefined, title),
      };
    }).filter(Boolean) as TrackingOrderItem[];
  }

  return [];
}

export async function startRiderSession(input: {
  order_id: string;
  buyer_id: string;
  merchant_id: string;
  merchant_name: string;
  items_summary: string;
  order_items?: TrackingOrderItem[];
  address: string;
  handoff_note?: string;
  eta_label: string;
  payment_method?: string;
  amount_micro?: number;
  restaurant_lat?: number;
  restaurant_lng?: number;
  dest_lat?: number;
  dest_lng?: number;
  started_at?: string;
}) {
  const store = await readStore();
  const devStartedAt =
    input.started_at &&
    (process.env.AQOND_LOCAL_DEV === '1' || process.env.AQOND_ALLOW_LOCAL_ORDERS === '1')
      ? input.started_at
      : undefined;
  const session: RiderSession = {
    order_id: input.order_id,
    buyer_id: input.buyer_id,
    merchant_id: input.merchant_id,
    merchant_name: input.merchant_name,
    items_summary: input.items_summary,
    order_items: input.order_items,
    address: input.address,
    handoff_note: input.handoff_note,
    eta_label: input.eta_label,
    payment_method: input.payment_method || 'cod',
    amount_micro: input.amount_micro || 0,
    started_at: devStartedAt || new Date().toISOString(),
    restaurant: {
      lat: input.restaurant_lat ?? 13.7563,
      lng: input.restaurant_lng ?? 100.5018,
      name: input.merchant_name,
    },
    destination: {
      lat: input.dest_lat ?? 13.728,
      lng: input.dest_lng ?? 100.52,
    },
    rider: { ...DEMO_RIDER },
    chat_messages: [
      {
        from: 'rider',
        text: 'สวัสดีครับ ผมคุณบีม ไว้ผมดูแลออเดอร์นี้ให้นะครับ 🛵',
        at: new Date().toISOString(),
      },
    ],
    delivery_photo_url: DELIVERY_PHOTO,
  };
  store[input.order_id] = session;
  await writeStore(store);
  return getRiderTracking(input.order_id);
}

export async function getRiderTracking(orderId: string): Promise<RiderTrackingView | null> {
  const store = await readStore();
  const raw = store[orderId];
  if (!raw) return null;

  const session: RiderSession = {
    ...raw,
    payment_method: raw.payment_method || 'cod',
    amount_micro: raw.amount_micro || 0,
    chat_messages: raw.chat_messages || [],
    delivery_photo_url: raw.delivery_photo_url || DELIVERY_PHOTO,
    rider: { ...DEMO_RIDER, ...raw.rider },
  };

  const elapsed = Date.now() - new Date(session.started_at).getTime();
  const hasReview = !!session.review;
  const state = computePhaseState(elapsed, session, hasReview);
  const orderItems = await resolveOrderItems(session);
  const itemCount = orderItems.reduce((n, it) => n + (it.qty || 1), 0);
  const totalMs = T.riderDone;
  const minutesLeft =
    state.phase === 'completed' || state.phase === 'review_pending'
      ? 0
      : Math.max(1, Math.ceil((totalMs - elapsed) / 60_000));

  return {
    ...session,
    phase: state.phase,
    progress: Math.min(1, state.progress),
    rider_pos: state.rider_pos,
    delivered: state.delivered || state.phase === 'review_pending' || state.phase === 'completed',
    status_th: PHASE_LABEL[state.phase],
    status_detail: state.status_detail,
    minutes_left: minutesLeft,
    show_rider: state.show_rider,
    show_rider_profile: state.show_rider_profile,
    timeline: buildTimeline(state.phase),
    active_events: state.active_events,
    can_review: state.phase === 'review_pending' && !session.review,
    can_chat: state.show_rider_profile,
    order_items: orderItems,
    item_count: itemCount,
  };
}

export async function submitDeliveryReview(
  orderId: string,
  input: { stars: number; comment?: string; tip_micro?: number },
) {
  const { assertCustomerConfirmedForReview } = await import('@/lib/server/foodConfirmReceipt');
  const ok = await assertCustomerConfirmedForReview(orderId);
  if (!ok) return null;

  const store = await readStore();
  const session = store[orderId];
  if (!session) return null;

  const tip = input.tip_micro || 0;
  const points = Math.max(10, Math.round((session.amount_micro || 5000) / 1000));
  session.review = {
    stars: Math.min(5, Math.max(1, input.stars)),
    comment: input.comment,
    tip_micro: tip,
    submitted_at: new Date().toISOString(),
  };
  session.points_earned = points;
  await writeStore(store);

  const { appendAqondEvent } = await import('@/lib/server/aqondEventBus');
  await appendAqondEvent({
    order_id: orderId,
    event_type: 'order.review_submitted',
    source: 'storefront',
    actor: session.buyer_id,
    payload: {
      stars: session.review.stars,
      comment: session.review.comment,
    },
  });
  if (tip > 0) {
    await appendAqondEvent({
      order_id: orderId,
      event_type: 'order.tip_paid',
      source: 'storefront',
      actor: session.buyer_id,
      payload: { tip_micro: tip, rider_name: session.rider?.name },
    });
  }

  return getRiderTracking(orderId);
}

export async function submitDeliveryReport(
  orderId: string,
  input: { type: DeliveryReport['type']; note?: string },
) {
  const store = await readStore();
  const session = store[orderId];
  if (!session) return null;

  session.report = {
    type: input.type,
    note: input.note,
    submitted_at: new Date().toISOString(),
  };
  await writeStore(store);
  return getRiderTracking(orderId);
}

export async function addChatMessage(
  orderId: string,
  text: string,
  from: 'customer' | 'rider' = 'customer',
  image_url?: string,
) {
  const store = await readStore();
  const session = store[orderId];
  if (!session) return null;

  if (!Array.isArray(session.chat_messages)) {
    session.chat_messages = [];
  }
  const trimmed = String(text || '').trim();
  const img = String(image_url || '').trim();
  session.chat_messages.push({
    from,
    text: trimmed || (img ? '📷 ส่งรูปหลักฐาน' : ''),
    at: new Date().toISOString(),
    ...(img ? { image_url: img, kind: 'image' as const } : { kind: 'text' as const }),
  });
  await writeStore(store);
  return getRiderTracking(orderId);
}

/** @deprecated use DeliveryPhase */
export type RiderPhase = DeliveryPhase;
