import type { RefundEngine } from '../contracts';
import type { RefundRecord, ReturnRequestRecord } from '../db-model';
import type { ReturnConfig } from '../types';

export type { RefundEngine };

export type CreateRefundDetailInput = {
  return_record: ReturnRequestRecord;
  order_amount_micro: number;
  refund_id: string;
  destination?: 'wallet' | 'bank';
  currency?: string;
  now?: string;
};

/** B2.7-S002 — OR002 Refund detail record (pending until escrow in S003). */
export function createRefundDetail(input: CreateRefundDetailInput, config: ReturnConfig): RefundRecord {
  if (!config.capabilities.refund_request?.enabled) {
    throw new Error('refund_request_disabled');
  }
  if (!input.return_record.return_id) {
    throw new Error('return_id_required');
  }
  if (input.order_amount_micro <= 0) {
    throw new Error('invalid_refund_amount');
  }

  const now = input.now || new Date().toISOString();
  return {
    refund_id: input.refund_id,
    return_id: input.return_record.return_id,
    order_id: input.return_record.order_id,
    buyer_id: input.return_record.buyer_id,
    amount_micro: input.order_amount_micro,
    currency: input.currency || 'THB',
    state: 'pending',
    destination: input.destination || 'wallet',
    created_at: now,
  };
}

export function buildRefundId(returnId: string, suffix?: string): string {
  const tail = (suffix || Math.random().toString(36).slice(2, 8)).slice(0, 8);
  return `rfnd-${returnId.slice(-12)}-${tail}`.toLowerCase();
}
