/**
 * Database model contracts — design only (Phase 0).
 * No migrations. Implement in B2.7-S001+ after review.
 */

export type ReturnRequestRecord = {
  return_id: string;
  order_id: string;
  buyer_id: string;
  merchant_id: string;
  state: string;
  reason_code: string;
  detail?: string;
  return_method?: string;
  escrow_hold_id?: string;
  refund_id?: string;
  created_at: string;
  updated_at: string;
};

export type RefundRecord = {
  refund_id: string;
  return_id: string;
  order_id: string;
  buyer_id: string;
  amount_micro: number;
  currency: string;
  state: string;
  destination: 'wallet' | 'bank';
  escrow_reference?: string;
  completed_at?: string;
  created_at: string;
};

export type ReturnEvidenceRecord = {
  evidence_id: string;
  return_id: string;
  type: 'image' | 'video' | 'text' | 'log' | 'gps';
  storage_key: string;
  actor: string;
  captured_at: string;
};

export type ReturnTimelineRecord = {
  event_id: string;
  return_id: string;
  at: string;
  actor: string;
  action: string;
  note?: string;
  metadata_json?: string;
};

export type DisputeRecord = {
  dispute_id: string;
  order_id: string;
  return_id?: string;
  state: 'open' | 'mediation' | 'resolved' | 'closed';
  opened_by: string;
  resolution?: string;
  created_at: string;
  closed_at?: string;
};

export type CancelledOrderArchive = {
  order_id: string;
  buyer_id: string;
  archived_at: string;
  snapshot_json: string;
  /** Archive only — never hard delete */
  retention_policy: 'archive_only';
};

/** Logical tables for Phase 1 migration planning */
export const RETURN_CORE_TABLES = [
  'return_requests',
  'refund_requests',
  'return_evidence',
  'return_timeline_events',
  'disputes',
  'cancelled_order_archive',
  'escrow_holds',
  'escrow_reconciliation_runs',
] as const;
