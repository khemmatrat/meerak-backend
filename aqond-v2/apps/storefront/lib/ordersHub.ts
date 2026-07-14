export type OrderTab =
  | 'all'
  | 'topay'
  | 'toship'
  | 'toreceive'
  | 'completed'
  | 'returnrefund'
  | 'torate';

export const ORDER_TABS: Array<{ id: OrderTab; label: string }> = [
  { id: 'toship', label: 'ที่ต้องจัดส่ง' },
  { id: 'toreceive', label: 'ที่ต้องได้รับ' },
  { id: 'completed', label: 'สำเร็จ' },
  { id: 'returnrefund', label: 'คืนเงิน/คืนสินค้า' },
  { id: 'torate', label: 'ให้คะแนน' },
];

export function filterOrdersByTab(orders: any[], tab: OrderTab) {
  const marketplace = orders.filter(
    (o) => o.order_type !== 'food' && !String(o.merchant_id || '').startsWith('food-'),
  );
  const list = tab === 'all' ? marketplace : marketplace;
  switch (tab) {
    case 'topay':
      return list.filter((o) => o.status === 'pending_payment' || o.payment_status === 'pending');
    case 'toship':
      return list.filter(
        (o) =>
          ['paid', 'confirmed', 'pending'].includes(String(o.status)) &&
          !o.tracking_no &&
          o.status !== 'pending_payment',
      );
    case 'toreceive':
      return list.filter(
        (o) => o.status === 'shipped' || o.tracking_no || o.fulfillment_status === 'shipped',
      );
    case 'completed':
      return list.filter(
        (o) => o.status === 'completed' || o.fulfillment_status === 'delivered',
      );
    case 'torate':
      return list.filter((o) => o.status === 'completed' || o.fulfillment_status === 'delivered');
    case 'returnrefund':
      return [];
    default:
      return list;
  }
}

export function countOrdersByTab(orders: any[]) {
  return ORDER_TABS.reduce(
    (acc, tab) => {
      acc[tab.id] = filterOrdersByTab(orders, tab.id).length;
      return acc;
    },
    {} as Record<OrderTab, number>,
  );
}
