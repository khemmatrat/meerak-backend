import crypto from 'crypto';
import { getDisputeCase, updateDisputeCase, appendDisputeTimeline } from '@/lib/server/merchantDisputes';
import { getOrderById } from '@/lib/server/orderStore';
import { appendAqondEvent } from '@/lib/server/aqondEventBus';

export async function createReplaceOrderForClaim(caseId: string, actor = 'admin') {
  const claim = await getDisputeCase(caseId);
  if (!claim) return null;
  if (claim.replacement_order_id) return claim;

  const original = await getOrderById(claim.order_id);
  const replacementId = `ord-repl-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

  await updateDisputeCase(caseId, {
    replacement_order_id: replacementId,
    status: 'under_review',
    resolution_note: `สร้างออเดอร์ทดแทน ${replacementId}`,
  });
  await appendDisputeTimeline(caseId, 'admin', 'replace', `replacement ${replacementId}`);

  await appendAqondEvent({
    order_id: claim.order_id,
    event_type: 'claim.replaced',
    source: 'storefront',
    actor,
    payload: {
      case_id: caseId,
      replacement_order_id: replacementId,
      merchant_id: claim.merchant_id,
      buyer_id: claim.customer_id,
      copied_from: original?.order_id || claim.order_id,
    },
  });

  return getDisputeCase(caseId);
}
