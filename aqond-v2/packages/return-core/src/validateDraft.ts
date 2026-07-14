import { listEnabledReturnMethods } from './states';
import type { ReturnConfig, ReturnReasonCode, ReturnRequestDraft } from './types';

const REASON_CODES: ReturnReasonCode[] = [
  'damaged',
  'wrong_item',
  'not_as_described',
  'changed_mind',
  'other',
];

export function validateReturnRequestDraft(
  draft: ReturnRequestDraft,
  config: ReturnConfig,
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!draft.order_id?.trim()) errors.push('order_id_required');
  if (!draft.buyer_id?.trim()) errors.push('buyer_id_required');
  if (!draft.merchant_id?.trim()) errors.push('merchant_id_required');
  if (!REASON_CODES.includes(draft.reason_code)) errors.push('invalid_reason_code');
  if (draft.detail && draft.detail.length > 2000) errors.push('detail_too_long');
  if (draft.return_method) {
    const enabled = listEnabledReturnMethods(config);
    if (!enabled.includes(draft.return_method)) errors.push('return_method_disabled');
  }
  return { ok: errors.length === 0, errors };
}
