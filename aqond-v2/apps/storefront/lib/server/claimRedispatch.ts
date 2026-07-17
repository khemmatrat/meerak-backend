import { getDisputeCase, updateDisputeCase, appendDisputeTimeline } from '@/lib/server/merchantDisputes';
import { localListDispatchJobs, localCreateDispatchJob } from '@/lib/server/localDispatch';
import { getOrderById } from '@/lib/server/orderStore';
import { appendAqondEvent } from '@/lib/server/aqondEventBus';

export async function redispatchClaim(caseId: string, actor = 'admin') {
  const claim = await getDisputeCase(caseId);
  if (!claim) return null;
  if (claim.redispatch_job_id) return claim;

  const order = await getOrderById(claim.order_id);
  const { jobs } = await localListDispatchJobs({});
  const existing = jobs.find((j) => j.order_id === claim.order_id && j.status !== 'completed');
  if (existing) {
    await updateDisputeCase(caseId, { redispatch_job_id: existing.id });
    return getDisputeCase(caseId);
  }

  const created = await localCreateDispatchJob({
    order_id: claim.order_id,
    merchant_id: claim.merchant_id,
    buyer_id: claim.customer_id,
    merchant_name: order?.merchant_name || 'ร้านอาหาร',
    items_summary: claim.title,
    address: order?.shipping_address || '',
    payment_method: order?.method || 'cod',
    amount_micro: claim.order_total_micro,
    job_type: 'food',
  });

  const jobId = created?.job?.id;
  if (!jobId) return null;

  await updateDisputeCase(caseId, {
    redispatch_job_id: jobId,
    status: 'under_review',
    resolution_note: `re-dispatch job ${jobId}`,
  });
  await appendDisputeTimeline(caseId, 'admin', 'redispatch', jobId);

  await appendAqondEvent({
    order_id: claim.order_id,
    event_type: 'claim.redispatched',
    source: 'storefront',
    actor,
    payload: { case_id: caseId, job_id: jobId },
  });

  return getDisputeCase(caseId);
}
