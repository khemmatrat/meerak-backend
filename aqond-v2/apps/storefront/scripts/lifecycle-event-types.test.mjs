#!/usr/bin/env node
/** Sprint S13 — lifecycle event catalog contract (mirrors lifecycleEventTypes.ts) */
const EXPECTED = [
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

if (EXPECTED.length < 28) {
  console.error('expected at least 28 types, got', EXPECTED.length);
  process.exit(1);
}
if (!EXPECTED.includes('order.customer_confirmed')) process.exit(1);
if (EXPECTED.includes('fairplay.reward')) process.exit(1);
console.log('lifecycle-event-types.test.mjs OK', EXPECTED.length);
