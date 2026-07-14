import {
  MERCHANT_ACCEPT_SLA_MINUTES,
  orderAcceptSlaState,
  type OrderLike,
} from '@/lib/orderSla';

export { MERCHANT_ACCEPT_SLA_MINUTES, orderAcceptSlaState };
export type { OrderLike as OrderSlaOrderLike };

export type OrderSlaState = ReturnType<typeof orderAcceptSlaState>;

export function countSlaBreachedOrders(orders: OrderLike[]): number {
  return orders.filter((o) => orderAcceptSlaState(o).breached).length;
}

export function slaBreachedOrderIds(orders: OrderLike[]): string[] {
  return orders
    .filter((o) => orderAcceptSlaState(o).breached)
    .map((o) => String((o as any).order_id || (o as any).id))
    .filter(Boolean);
}
