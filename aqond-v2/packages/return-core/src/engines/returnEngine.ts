import type { ReturnEngine } from '../contracts';
import type { ReturnRequestDraft } from '../types';
import type { ReturnRequestRecord } from '../db-model';
import { validateReturnRequestDraft } from '../validateDraft';
import type { ReturnConfig } from '../types';

export type { ReturnEngine };

export type CreateReturnRequestInput = {
  draft: ReturnRequestDraft;
  config: ReturnConfig;
  return_id: string;
  now?: string;
};

/** B2.7-S001 — OR001 Return Request engine (state: requested). */
export function createReturnRequest(input: CreateReturnRequestInput): ReturnRequestRecord {
  const validation = validateReturnRequestDraft(input.draft, input.config);
  if (!validation.ok) {
    throw new Error(`return_request_invalid:${validation.errors.join(',')}`);
  }
  if (!input.config.capabilities.return_request?.enabled) {
    throw new Error('return_request_disabled');
  }

  const now = input.now || new Date().toISOString();
  return {
    return_id: input.return_id,
    order_id: input.draft.order_id,
    buyer_id: input.draft.buyer_id,
    merchant_id: input.draft.merchant_id,
    state: 'requested',
    reason_code: input.draft.reason_code,
    detail: input.draft.detail,
    return_method: input.draft.return_method,
    created_at: now,
    updated_at: now,
  };
}

export function buildReturnId(orderId: string, suffix?: string): string {
  const tail = (suffix || Math.random().toString(36).slice(2, 8)).slice(0, 8);
  return `ret-${orderId.slice(-10)}-${tail}`.toLowerCase();
}
