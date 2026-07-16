import { handoffOrderToDispatch, isOnDemandDispatch } from '@/lib/server/dispatchHandoff';
import type { MerchantOrderView } from '@/lib/server/merchantOrders';
import { getOrderById } from '@/lib/server/orderStore';

export type CheckoutHandoffInput = {
  order_id: string;
  buyer_id: string;
  merchant_id: string;
  amount_micro: number;
  items?: unknown[];
  recipient?: string;
  phone?: string;
  order_type?: string;
  carrier_id?: string;
  merchant_name?: string;
};

function toMerchantView(input: CheckoutHandoffInput): MerchantOrderView {
  return {
    order_id: input.order_id,
    id: input.order_id,
    buyer_id: input.buyer_id,
    merchant_id: input.merchant_id,
    status: 'confirmed',
    fulfillment_status: 'pending_accept',
    amount_micro: input.amount_micro,
    total_micro: input.amount_micro,
    items: input.items,
    recipient: input.recipient,
    phone: input.phone,
    order_type: input.order_type,
    carrier_id: input.carrier_id,
    merchant_name: input.merchant_name,
    source: 'checkout',
  };
}

/** Create an open dispatch job when a customer orders on-demand delivery (food / aqond-rider). */
export async function handoffCustomerOrderToDispatch(input: CheckoutHandoffInput) {
  const view = toMerchantView(input);
  if (!isOnDemandDispatch(view)) return null;
  return handoffOrderToDispatch(view, 'accepted');
}

export async function handoffStoredOrderToDispatch(orderId: string) {
  const o = await getOrderById(orderId);
  if (!o) return null;
  const view: MerchantOrderView = {
    order_id: o.order_id,
    id: o.order_id,
    buyer_id: o.buyer_id,
    merchant_id: o.merchant_id,
    status: o.status,
    fulfillment_status: o.fulfillment_status || 'pending_accept',
    amount_micro: o.amount_micro,
    total_micro: o.amount_micro,
    items: o.items,
    recipient: o.recipient,
    phone: o.phone,
    order_type: o.order_type,
    carrier_id: o.carrier_id,
    merchant_name: o.merchant_name,
    source: 'local',
  };
  if (!isOnDemandDispatch(view)) return null;
  return handoffOrderToDispatch(view, 'accepted');
}
