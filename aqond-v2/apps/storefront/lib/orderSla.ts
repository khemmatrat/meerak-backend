export const MERCHANT_ACCEPT_SLA_MINUTES = 5;

type OrderLike = {
  created_at?: string;
  fulfillment_status?: string;
};

export function orderAcceptSlaState(order: OrderLike) {
  const fs = order.fulfillment_status || '';
  const sla = MERCHANT_ACCEPT_SLA_MINUTES;
  if (!['pending_accept', 'pending_ship'].includes(fs)) {
    return { breached: false, minutes_waiting: 0, sla_minutes: sla, remaining_minutes: sla };
  }
  if (!order.created_at) {
    return { breached: false, minutes_waiting: 0, sla_minutes: sla, remaining_minutes: sla };
  }
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60_000));
  return {
    breached: minutes >= sla,
    minutes_waiting: minutes,
    sla_minutes: sla,
    remaining_minutes: Math.max(0, sla - minutes),
  };
}
