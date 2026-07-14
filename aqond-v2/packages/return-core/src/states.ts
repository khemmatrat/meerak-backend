import type { ReturnConfig, ReturnState } from './types';

/** Valid forward transitions — enforced by Return Engine in Phase 1+. */
export const RETURN_STATE_TRANSITIONS: Record<ReturnState, ReturnState[]> = {
  requested: ['approved', 'rejected', 'cancelled'],
  approved: ['pickup_scheduled', 'in_transit', 'cancelled'],
  pickup_scheduled: ['picked_up', 'cancelled'],
  picked_up: ['in_transit'],
  in_transit: ['delivered_merchant'],
  delivered_merchant: ['inspection', 'refund_pending'],
  inspection: ['refund_pending', 'rejected'],
  refund_pending: ['refund_completed', 'rejected'],
  refund_completed: [],
  rejected: [],
  cancelled: [],
};

export function canTransition(from: ReturnState, to: ReturnState): boolean {
  return RETURN_STATE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function listEnabledReturnMethods(config: ReturnConfig): string[] {
  return Object.entries(config.return_methods)
    .filter(([, row]) => row.enabled)
    .map(([id]) => id);
}
