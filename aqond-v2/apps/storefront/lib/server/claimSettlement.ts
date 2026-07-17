import {
  appendDisputeTimeline,
  computeDefaultResolution,
  getDisputeCase,
  updateDisputeCase,
  type MerchantDisputeCase,
} from '@/lib/server/merchantDisputes';
import { appendAqondEvent } from '@/lib/server/aqondEventBus';

export type SettleClaimInput = {
  case_id: string;
  actor?: string;
  refund_micro?: number;
  partial?: boolean;
  note?: string;
};

export async function settleClaim(input: SettleClaimInput): Promise<MerchantDisputeCase | null> {
  const hit = await getDisputeCase(input.case_id);
  if (!hit) return null;
  if (['closed', 'resolved_refund', 'resolved_charge', 'resolved_mutual'].includes(hit.status)) {
    return hit;
  }

  const def = computeDefaultResolution({
    category: hit.category,
    order_total_micro: hit.order_total_micro,
    items: hit.items,
  });

  const refund =
    input.partial && input.refund_micro != null
      ? Math.max(0, Math.min(hit.order_total_micro, Math.round(input.refund_micro)))
      : def.refund_amount_micro;

  const updated = await updateDisputeCase(input.case_id, {
    refund_amount_micro: refund,
    charge_amount_micro: Math.max(0, hit.order_total_micro - refund),
    status: refund > 0 ? 'resolved_refund' : 'resolved_charge',
    resolution_note: input.note || def.note || 'ตัดสินโดยแพลตฟอร์ม',
  });
  if (!updated) return null;

  await appendDisputeTimeline(
    input.case_id,
    'admin',
    input.partial ? 'partial_refund' : 'settle',
    updated.resolution_note,
  );

  await appendAqondEvent({
    order_id: hit.order_id,
    event_type: 'claim.settled',
    source: 'storefront',
    actor: input.actor || 'admin',
    payload: {
      case_id: hit.id,
      category: hit.category,
      refund_micro: refund,
      partial: !!input.partial,
    },
  });

  if (refund > 0) {
    await appendAqondEvent({
      order_id: hit.order_id,
      event_type: 'order.refunded',
      source: 'storefront',
      actor: input.actor || 'admin',
      payload: { case_id: hit.id, refund_micro: refund },
    });
  }

  return getDisputeCase(input.case_id);
}

export async function escalateClaim(caseId: string, actor = 'admin', note?: string) {
  const hit = await getDisputeCase(caseId);
  if (!hit) return null;
  await updateDisputeCase(caseId, { status: 'under_review' });
  await appendDisputeTimeline(caseId, 'admin', 'escalate', note || 'escalated to platform review');
  await appendAqondEvent({
    order_id: hit.order_id,
    event_type: 'claim.escalated',
    source: 'storefront',
    actor,
    payload: { case_id: caseId },
  });
  return getDisputeCase(caseId);
}

export async function closeClaim(caseId: string, actor = 'admin', note?: string) {
  const hit = await getDisputeCase(caseId);
  if (!hit) return null;
  await updateDisputeCase(caseId, { status: 'closed' });
  await appendDisputeTimeline(caseId, 'admin', 'close', note || 'case closed');
  await appendAqondEvent({
    order_id: hit.order_id,
    event_type: 'claim.closed',
    source: 'storefront',
    actor,
    payload: { case_id: caseId },
  });
  return getDisputeCase(caseId);
}
