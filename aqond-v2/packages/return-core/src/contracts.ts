import type { ReturnRequestDraft, TimelineEvent } from './types';

/** Reuse existing escrow — adapter only, no rewrite (Phase 0 contract). */
export interface EscrowAdapter {
  hold(params: { order_id: string; amount_micro: number; reason: string }): Promise<{ hold_id: string }>;
  release(params: { hold_id: string; to_merchant_id: string }): Promise<{ status: 'released' }>;
  refund(params: {
    hold_id: string;
    to_buyer_id: string;
    amount_micro: number;
    destination: 'wallet' | 'bank';
  }): Promise<{ status: 'refunded'; reference: string }>;
}

export interface CarrierAdapter {
  provider_id: string;
  createReturnLabel(params: {
    return_id: string;
    from_address: string;
    to_merchant_address: string;
  }): Promise<{ tracking_number: string; label_url?: string }>;
  track(tracking_number: string): Promise<{ status: string; events: TimelineEvent[] }>;
}

export interface PickupAdapter {
  schedule(params: {
    return_id: string;
    window_start: string;
    window_end: string;
    address: string;
  }): Promise<{ pickup_id: string; scheduled_at: string }>;
}

export interface NotificationAdapter {
  notify(params: {
    channel: 'push' | 'email' | 'sms' | 'in_app';
    user_id: string;
    template: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
}

export interface AuditAdapter {
  append(params: {
    entity_type: 'return' | 'refund' | 'dispute';
    entity_id: string;
    action: string;
    actor: string;
    payload?: Record<string, unknown>;
  }): Promise<{ audit_id: string }>;
}

export interface TimelineEngine {
  append(event: Omit<TimelineEvent, 'id'> & { id?: string }): Promise<TimelineEvent>;
  list(entity_id: string): Promise<TimelineEvent[]>;
}

export interface ReturnEngine {
  createRequest(draft: ReturnRequestDraft): Promise<{ return_id: string; state: string }>;
}

export interface RefundEngine {
  initiate(params: { return_id: string; amount_micro: number }): Promise<{ refund_id: string }>;
}

export interface PolicyEngine {
  evaluateAutoRefund(params: {
    return_state: string;
    delivered_to_merchant_at?: string;
    merchant_last_action_at?: string;
    requested_at: string;
  }): Promise<{ should_auto_refund: boolean; rule_id?: string }>;
}
