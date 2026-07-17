import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const EVENTS_FILE = path.join(process.cwd(), '.data', 'dev', 'aqond-order-events.json');

/** Canonical lifecycle + dispatch events — single stream for all surfaces */
export type AqondEventType =
  | 'order.created'
  | 'merchant.accepted'
  | 'merchant.cooking_started'
  | 'merchant.packing_proof'
  | 'merchant.ready'
  | 'dispatch.search_started'
  | 'dispatch.rider_offered'
  | 'dispatch.rider_rejected'
  | 'dispatch.rider_timeout'
  | 'dispatch.rider_accepted'
  | 'rider.assigned'
  | 'rider.qr_verified'
  | 'rider.pickup_photo'
  | 'rider.pickup_completed'
  | 'rider.picked_up'
  | 'rider.en_route'
  | 'rider.arrived'
  | 'order.delivered'
  | 'order.customer_confirmed'
  | 'order.review_submitted'
  | 'order.tip_paid'
  | 'claim.opened'
  | 'claim.settled'
  | 'claim.redispatched'
  | 'claim.replaced'
  | 'claim.escalated'
  | 'claim.closed'
  | 'order.refunded'
  | 'order.cancelled'
  | 'passenger.trip_completed';

export type AqondEventSource =
  | 'order-svc'
  | 'dispatch-svc'
  | 'storefront'
  | 'payment-svc'
  | 'admin'
  | 'wallet-svc';

export type AqondLifecycleEvent = {
  id: string;
  order_id: string;
  event_type: AqondEventType;
  source: AqondEventSource;
  actor?: string;
  phase?: string;
  job_id?: string;
  merchant_id?: string;
  rider_id?: string;
  payload?: Record<string, unknown>;
  at: string;
};

type EventStore = { events: AqondLifecycleEvent[] };

async function readStore(): Promise<EventStore> {
  try {
    return JSON.parse(await fs.readFile(EVENTS_FILE, 'utf8')) as EventStore;
  } catch {
    return { events: [] };
  }
}

async function writeStore(store: EventStore) {
  await fs.mkdir(path.dirname(EVENTS_FILE), { recursive: true });
  await fs.writeFile(EVENTS_FILE, JSON.stringify(store, null, 2), 'utf8');
}

export async function appendAqondEvent(
  input: Omit<AqondLifecycleEvent, 'id' | 'at'> & { at?: string },
): Promise<AqondLifecycleEvent> {
  const store = await readStore();
  const evt: AqondLifecycleEvent = {
    id: `evt-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
    at: input.at || new Date().toISOString(),
    ...input,
  };
  store.events.unshift(evt);
  if (store.events.length > 8000) store.events.length = 8000;
  await writeStore(store);
  return evt;
}

export async function listOrderEvents(orderId: string): Promise<AqondLifecycleEvent[]> {
  const store = await readStore();
  return store.events
    .filter((e) => e.order_id === orderId)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

export async function listRecentEvents(limit = 100): Promise<AqondLifecycleEvent[]> {
  const store = await readStore();
  return store.events.slice(0, limit);
}

export function fulfillmentStatusToEvent(status: string): AqondEventType | null {
  switch (status) {
    case 'accepted':
      return 'merchant.accepted';
    case 'preparing':
      return 'merchant.cooking_started';
    case 'ready':
      return 'merchant.ready';
    case 'shipped':
      return 'rider.picked_up';
    case 'delivered':
      return 'order.delivered';
    case 'rejected':
    case 'cancelled':
      return 'order.cancelled';
    default:
      return null;
  }
}

export function dispatchPhaseToEvent(phase: string): AqondEventType | null {
  switch (phase) {
    case 'rider_assigned':
      return 'rider.assigned';
    case 'rider_picked_up':
      return 'rider.picked_up';
    case 'en_route':
      return 'rider.en_route';
    case 'arrived':
    case 'handoff':
    case 'rider_calling':
      return 'rider.arrived';
    case 'rider_completed':
    case 'review_pending':
      return 'order.delivered';
    default:
      return null;
  }
}

export const EVENT_LABELS_TH: Record<AqondEventType, string> = {
  'order.created': 'ลูกค้าสั่งอาหาร',
  'merchant.accepted': 'ร้านรับออเดอร์',
  'merchant.cooking_started': 'เริ่มทำอาหาร',
  'merchant.packing_proof': 'ถ่ายรูปแพ็คอาหาร',
  'merchant.ready': 'อาหารพร้อมส่ง',
  'dispatch.search_started': 'ค้นหาไรเดอร์',
  'dispatch.rider_offered': 'เสนองานให้ไรเดอร์',
  'dispatch.rider_rejected': 'ไรเดอร์ปฏิเสธ',
  'dispatch.rider_timeout': 'ไรเดอร์ไม่ตอบ (timeout)',
  'dispatch.rider_accepted': 'ไรเดอร์รับงาน',
  'rider.assigned': 'มอบหมายไรเดอร์',
  'rider.qr_verified': 'สแกน QR รับออเดอร์',
  'rider.pickup_photo': 'ถ่ายรูปรับจากร้าน',
  'rider.pickup_completed': 'รับอาหารจากร้านแล้ว',
  'rider.picked_up': 'ออกเดินทางไปลูกค้า',
  'rider.en_route': 'กำลังนำส่ง',
  'rider.arrived': 'ถึงจุดส่ง',
  'order.delivered': 'ส่งสำเร็จ',
  'order.customer_confirmed': 'ลูกค้ายืนยันรับอาหาร',
  'order.review_submitted': 'ลูกค้าให้คะแนน',
  'order.tip_paid': 'ลูกค้าให้ทิป',
  'claim.opened': 'เปิดเคส Claim',
  'claim.settled': 'ตัดสิน Claim',
  'claim.redispatched': 'ส่งงานใหม่ (Re-dispatch)',
  'claim.replaced': 'สร้างออเดอร์ทดแทน',
  'claim.escalated': 'Escalate Claim',
  'claim.closed': 'ปิดเคส Claim',
  'order.refunded': 'คืนเงินแล้ว',
  'order.cancelled': 'ยกเลิกออเดอร์',
  'passenger.trip_completed': 'จบการเดินทาง',
};

export const DISPATCH_EVENT_TYPES: AqondEventType[] = [
  'dispatch.search_started',
  'dispatch.rider_offered',
  'dispatch.rider_rejected',
  'dispatch.rider_timeout',
  'dispatch.rider_accepted',
];

export function isDispatchTimelineEvent(type: AqondEventType): boolean {
  return DISPATCH_EVENT_TYPES.includes(type);
}
