/**
 * Frozen Intent catalog — humans think in intents, not APIs (Phase 3.8).
 * AGK authorizes INTENT → decomposes to scoped SERVICE capabilities.
 */
export const INTENTS = {
  'intent.place_food_order': {
    intent_id: 'intent.place_food_order',
    name: 'Place Food Order',
    risk_class: 'L2',
    hitl_before_pay: true,
    policy_id: 'P-4001',
    capabilities: [
      { service_id: 'location-v1', action: 'read.location', policy_id: 'P-4010' },
      { service_id: 'marketplace-v2', action: 'read.restaurant', policy_id: 'P-4011' },
      { service_id: 'food-v5', action: 'read.menu', policy_id: 'P-4012' },
      { service_id: 'food-v5', action: 'read.hours', policy_id: 'P-4013' },
      { service_id: 'marketplace-v2', action: 'read.promotion', policy_id: 'P-4014' },
      { service_id: 'wallet-v3', action: 'read.balance', policy_id: 'P-4015' },
      { service_id: 'food-v5', action: 'compute.delivery_eta', policy_id: 'P-4016' },
      { service_id: 'food-v5', action: 'create.order', policy_id: 'P-4017' },
      { service_id: 'wallet-v3', action: 'pay.checkout', policy_id: 'P-4018', hitl_required: true },
    ],
  },
  'intent.find_restaurant': {
    intent_id: 'intent.find_restaurant',
    name: 'Find Restaurant',
    risk_class: 'L0',
    hitl_before_pay: false,
    policy_id: 'P-4002',
    capabilities: [
      { service_id: 'location-v1', action: 'read.location', policy_id: 'P-4010' },
      { service_id: 'marketplace-v2', action: 'search.restaurant', policy_id: 'P-4020' },
      { service_id: 'food-v5', action: 'read.hours', policy_id: 'P-4013' },
      { service_id: 'marketplace-v2', action: 'read.promotion', policy_id: 'P-4014' },
    ],
  },
  'intent.plan_trip': {
    intent_id: 'intent.plan_trip',
    name: 'Plan Trip',
    risk_class: 'L1',
    hitl_before_pay: false,
    policy_id: 'P-4003',
    capabilities: [
      { service_id: 'booking-v2', action: 'search.accommodation', policy_id: 'P-4030' },
      { service_id: 'booking-v2', action: 'search.transport', policy_id: 'P-4031' },
      { service_id: 'marketplace-v2', action: 'read.attraction', policy_id: 'P-4032' },
      { service_id: 'wallet-v3', action: 'read.balance', policy_id: 'P-4015' },
      { service_id: 'booking-v2', action: 'create.itinerary', policy_id: 'P-4033' },
    ],
  },
};

export function getIntent(intentId) {
  return INTENTS[intentId] || null;
}

export function listIntents() {
  return Object.values(INTENTS);
}
