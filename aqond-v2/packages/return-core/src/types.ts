/** B2.7 Order Resolution / Return-Refund Core — shared platform contracts (Phase 0). */

export const RETURN_REFUND_CORE_MISSION_ID = 'RETURN-REFUND-CORE';

/** Return lifecycle — config-driven transitions in Phase 1+. */
export type ReturnState =
  | 'requested'
  | 'approved'
  | 'pickup_scheduled'
  | 'picked_up'
  | 'in_transit'
  | 'delivered_merchant'
  | 'inspection'
  | 'refund_pending'
  | 'refund_completed'
  | 'rejected'
  | 'cancelled';

export type RefundState =
  | 'pending'
  | 'escrow_held'
  | 'approved'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'rejected';

export type OrderResolutionTab =
  | 'all'
  | 'awaiting_payment'
  | 'preparing'
  | 'shipping'
  | 'received'
  | 'completed'
  | 'return'
  | 'refund'
  | 'cancelled'
  | 'dispute'
  | 'must_receive'
  | 'must_review';

export type ReturnReasonCode =
  | 'damaged'
  | 'wrong_item'
  | 'not_as_described'
  | 'changed_mind'
  | 'other';

export type ReturnMethodId =
  | 'home_pickup'
  | 'post_office'
  | 'flash'
  | 'kerry'
  | 'jt'
  | 'other_carrier'
  | 'self_dropoff';

export type ResolutionCapabilityId =
  | 'return_request'
  | 'refund_request'
  | 'exchange_request'
  | 'cancel_order'
  | 'escrow_release'
  | 'escrow_refund'
  | 'pickup_scheduling'
  | 'courier_return'
  | 'return_tracking'
  | 'merchant_decision'
  | 'aqond_mediation'
  | 'auto_refund'
  | 'wallet_settlement'
  | 'evidence_center'
  | 'timeline'
  | 'dispute_center'
  | 'audit'
  | 'ai_assistance';

export type AutoRefundRule = {
  id: string;
  trigger: 'return_delivered_to_merchant' | 'return_requested';
  merchant_response_hours?: number;
  max_days?: number;
  action: 'auto_approve_refund' | 'auto_refund_if_merchant_no_action';
};

export type ReturnConfig = {
  schema_version: number;
  mission_id: string;
  core_version: string;
  updated_at: string;
  vertical: string;
  escrow: { adapter: string; rewrite_allowed: boolean };
  auto_refund_policy: { enabled: boolean; rules: AutoRefundRule[] };
  return_methods: Record<string, { enabled: boolean; provider: string }>;
  order_tabs: OrderResolutionTab[];
  capabilities: Record<ResolutionCapabilityId, { enabled: boolean; phase: number }>;
};

export type ReturnRequestDraft = {
  order_id: string;
  buyer_id: string;
  merchant_id: string;
  reason_code: ReturnReasonCode;
  detail?: string;
  evidence_ids?: string[];
  return_method?: ReturnMethodId;
};

export type TimelineEvent = {
  id: string;
  at: string;
  actor: 'customer' | 'merchant' | 'rider' | 'carrier' | 'aqond' | 'jarvis' | 'system';
  action: string;
  note?: string;
  metadata?: Record<string, unknown>;
};

export type EvidenceItem = {
  id: string;
  type: 'image' | 'video' | 'text' | 'log' | 'gps';
  url?: string;
  text?: string;
  captured_at: string;
  actor: string;
};

export type RefundOrderItem = {
  product_id?: string;
  title: string;
  qty: number;
  unit_price_micro: number;
  variation?: string;
  image_url?: string;
};
