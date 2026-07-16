import { createDispatchJob } from '@/lib/server/dispatchSvc';
import type { MerchantOrderView } from '@/lib/server/merchantOrders';

function itemsSummary(order: MerchantOrderView) {
  const items: Array<{ title?: string; product_id?: string; qty?: number }> = Array.isArray(order.items)
    ? (order.items as Array<{ title?: string; product_id?: string; qty?: number }>)
    : [];
  const summary = items
    .map((it) => `${it.title || it.product_id || 'item'} x${it.qty || 1}`)
    .join(', ');
  return summary || `ออเดอร์ #${order.order_id.slice(-6)}`;
}

export function isOnDemandDispatch(order: MerchantOrderView) {
  return order.order_type === 'food' || order.carrier_id === 'aqond-rider';
}

export async function handoffOrderToDispatch(
  order: MerchantOrderView,
  fulfillmentPhase: string,
) {
  const jobType = order.order_type === 'food' ? 'food' : 'parcel';
  return createDispatchJob({
    order_id: order.order_id,
    merchant_id: order.merchant_id,
    buyer_id: order.buyer_id,
    merchant_name: order.merchant_name || order.merchant_id,
    items_summary: itemsSummary(order),
    address: order.recipient
      ? `${order.recipient}${order.phone ? ` · ${order.phone}` : ''}`
      : 'ที่อยู่ลูกค้า',
    recipient_name: order.recipient,
    customer_phone: order.phone,
    payment_method: 'cod',
    amount_micro: order.amount_micro || order.total_micro || 0,
    job_type: jobType,
    fulfillment_phase: fulfillmentPhase,
  });
}

/** @deprecated use handoffOrderToDispatch */
export const handoffFoodOrderToDispatch = handoffOrderToDispatch;
