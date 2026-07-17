import type { AqondEventType } from '@/lib/server/aqondEventBus';

/** Canonical catalog — every business transition must map here (S13). */
export const LIFECYCLE_EVENT_TYPES: AqondEventType[] = [
  'order.created',
  'merchant.accepted',
  'merchant.cooking_started',
  'merchant.packing_proof',
  'merchant.ready',
  'dispatch.search_started',
  'dispatch.rider_offered',
  'dispatch.rider_rejected',
  'dispatch.rider_timeout',
  'dispatch.rider_accepted',
  'rider.assigned',
  'rider.qr_verified',
  'rider.pickup_photo',
  'rider.pickup_completed',
  'rider.picked_up',
  'rider.en_route',
  'rider.arrived',
  'order.delivered',
  'order.customer_confirmed',
  'order.review_submitted',
  'order.tip_paid',
  'claim.opened',
  'claim.settled',
  'claim.redispatched',
  'claim.replaced',
  'claim.escalated',
  'claim.closed',
  'order.refunded',
  'order.cancelled',
  'passenger.trip_completed',
];

export function isKnownLifecycleEvent(type: string): type is AqondEventType {
  return (LIFECYCLE_EVENT_TYPES as string[]).includes(type);
}
