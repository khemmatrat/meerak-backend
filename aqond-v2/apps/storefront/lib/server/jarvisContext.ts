import { listOrdersForBuyer } from '@/lib/server/orderStore';

const ACTIVE_STATUSES = new Set([
  'pending', 'pending_payment', 'paid', 'confirmed', 'preparing', 'ready',
  'shipped', 'accepted', 'pending_ship', 'pending_accept', 'assigned', 'active',
]);

const STATUS_LABEL: Record<string, string> = {
  pending: 'รอดำเนินการ',
  preparing: 'กำลังเตรียม',
  ready: 'พร้อมส่ง',
  shipped: 'กำลังจัดส่ง',
  rider_assigned: 'ไรเดอร์รับงานแล้ว',
  en_route: 'กำลังนำไปส่ง',
};

export type JarvisActiveOrder = {
  order_id: string;
  status: string;
  status_label: string;
  merchant_name?: string;
  order_type?: string;
  track_href: string;
};

export async function loadJarvisActiveOrders(buyerId: string): Promise<JarvisActiveOrder[]> {
  if (!buyerId || buyerId === 'guest') return [];
  const orders = await listOrdersForBuyer(buyerId);
  return orders
    .filter((o: any) => {
      const st = o.fulfillment_status || o.status || '';
      return ACTIVE_STATUSES.has(st) && st !== 'completed' && st !== 'delivered' && st !== 'cancelled';
    })
    .slice(0, 5)
    .map((o: any) => {
      const oid = String(o.order_id || o.id);
      const isFood = o.order_type === 'food' || o.carrier_id === 'aqond-rider';
      const st = o.fulfillment_status || o.status || 'pending';
      return {
        order_id: oid,
        status: st,
        status_label: STATUS_LABEL[st] || st,
        merchant_name: o.merchant_name,
        order_type: o.order_type,
        track_href: isFood ? `/m/food/track/${oid}` : `/m/orders/${oid}/track`,
      };
    });
}
