import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { appendAqondEvent } from '@/lib/server/aqondEventBus';

const ORDERS_FILE = path.join(process.cwd(), '.data', 'orders.json');

export type StoredOrder = {
  order_id: string;
  buyer_id: string;
  merchant_id: string;
  status: string;
  amount_micro: number;
  discount_micro?: number;
  promo_code?: string;
  method: string;
  payment_status?: 'paid' | 'pending' | 'cod';
  payso_reference_id?: string;
  payment_intent_id?: string;
  payment_source?: 'payso' | 'stub';
  items: { product_id: string; title?: string; qty: number; unit_price_micro: number }[];
  recipient?: string;
  shipping_address?: string;
  postal_code?: string;
  phone?: string;
  tracking_no?: string;
  carrier_id?: string;
  order_type?: 'food' | 'marketplace';
  merchant_name?: string;
  delivery_eta_label?: string;
  fulfillment_status?: string;
  delivered_at?: string;
  buyer_confirmed_at?: string;
  created_at: string;
  idempotency_key?: string;
};

type OrderDb = {
  orders: StoredOrder[];
  idempotency?: Record<string, string>;
};

async function readDb(): Promise<OrderDb> {
  try {
    const data = JSON.parse(await fs.readFile(ORDERS_FILE, 'utf8'));
    return { orders: data.orders || [], idempotency: data.idempotency || {} };
  } catch {
    return { orders: [], idempotency: {} };
  }
}

async function writeDb(db: OrderDb) {
  await fs.mkdir(path.dirname(ORDERS_FILE), { recursive: true });
  await fs.writeFile(ORDERS_FILE, JSON.stringify(db, null, 2));
}

async function readOrders(): Promise<StoredOrder[]> {
  const db = await readDb();
  return db.orders;
}

async function writeOrders(orders: StoredOrder[]) {
  const db = await readDb();
  db.orders = orders;
  await writeDb(db);
}

export async function findOrderByIdempotencyKey(key: string): Promise<StoredOrder | null> {
  if (!key) return null;
  const db = await readDb();
  const orderId = db.idempotency?.[key];
  if (!orderId) return null;
  return db.orders.find((o) => o.order_id === orderId) || null;
}

export async function saveLocalOrder(
  input: Omit<StoredOrder, 'order_id' | 'created_at' | 'status'> & {
    order_id?: string;
    idempotency_key?: string;
  },
) {
  const db = await readDb();
  const order: StoredOrder = {
    order_id: input.order_id || `ord-${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`,
    buyer_id: input.buyer_id,
    merchant_id: input.merchant_id,
    status: input.payment_status === 'pending' ? 'pending_payment' : 'pending',
    amount_micro: input.amount_micro,
    discount_micro: input.discount_micro,
    promo_code: input.promo_code,
    method: input.method,
    payment_status: input.payment_status || (input.method === 'cod' ? 'cod' : 'pending'),
    payso_reference_id: input.payso_reference_id,
    payment_intent_id: input.payment_intent_id,
    payment_source: input.payment_source,
    items: input.items,
    recipient: input.recipient,
    shipping_address: input.shipping_address,
    postal_code: input.postal_code,
    phone: input.phone,
    tracking_no: input.tracking_no,
    carrier_id: input.carrier_id,
    order_type: input.order_type,
    merchant_name: input.merchant_name,
    delivery_eta_label: input.delivery_eta_label,
    idempotency_key: input.idempotency_key,
    created_at: new Date().toISOString(),
  };
  db.orders.unshift(order);
  if (input.idempotency_key) {
    db.idempotency = db.idempotency || {};
    db.idempotency[input.idempotency_key] = order.order_id;
  }
  await writeDb(db);

  await appendAqondEvent({
    order_id: order.order_id,
    event_type: 'order.created',
    source: 'storefront',
    merchant_id: order.merchant_id,
    actor: order.buyer_id,
    payload: {
      order_type: order.order_type,
      amount_micro: order.amount_micro,
      payment_method: order.method,
    },
  });

  return order;
}

export async function listAllLocalOrders(): Promise<StoredOrder[]> {
  return readOrders();
}

export async function setBuyerConfirmedAt(orderId: string, confirmedAt: string) {
  const orders = await readOrders();
  const hit = orders.find((o) => o.order_id === orderId);
  if (!hit) return null;
  hit.buyer_confirmed_at = confirmedAt;
  await writeOrders(orders);
  return hit;
}

export async function listOrdersForBuyer(buyerId: string): Promise<StoredOrder[]> {
  const orders = await readOrders();
  return orders.filter((o) => o.buyer_id === buyerId);
}

export async function listOrdersForMerchant(merchantId: string): Promise<StoredOrder[]> {
  const orders = await readOrders();
  return orders.filter((o) => o.merchant_id === merchantId);
}

export async function updateLocalOrderFulfillment(
  orderId: string,
  fulfillmentStatus: string,
  trackingNo?: string,
) {
  const orders = await readOrders();
  const hit = orders.find((o) => o.order_id === orderId);
  if (!hit) return null;
  hit.fulfillment_status = fulfillmentStatus;
  if (trackingNo) {
    hit.tracking_no = trackingNo;
    hit.carrier_id = hit.carrier_id || 'flash-th';
  }
  if (fulfillmentStatus === 'shipped') hit.status = 'shipped';
  if (fulfillmentStatus === 'delivered') {
    hit.status = 'completed';
    hit.delivered_at = hit.delivered_at || new Date().toISOString();
  }
  if (fulfillmentStatus === 'rejected') hit.status = 'cancelled';
  await writeOrders(orders);
  return hit;
}

export async function getOrderById(orderId: string): Promise<StoredOrder | null> {
  const orders = await readOrders();
  return orders.find((o) => o.order_id === orderId) || null;
}

export async function attachTracking(orderId: string, trackingNo: string, carrierId: string) {
  const orders = await readOrders();
  const hit = orders.find((o) => o.order_id === orderId);
  if (!hit) return null;
  hit.tracking_no = trackingNo;
  hit.carrier_id = carrierId;
  hit.status = 'shipped';
  await writeOrders(orders);
  return hit;
}

export async function readOrdersByIds(orderIds: string[]): Promise<StoredOrder[]> {
  const orders = await readOrders();
  const wanted = new Set(orderIds.filter(Boolean));
  return orders.filter((o) => wanted.has(o.order_id));
}

export async function markOrdersPaymentStatus(
  orderIds: string[],
  paymentStatus: 'paid' | 'pending' | 'failed',
) {
  const orders = await readOrders();
  let updated = 0;
  for (const orderId of orderIds) {
    const hit = orders.find((o) => o.order_id === orderId);
    if (!hit) continue;
    updated += 1;
    if (paymentStatus === 'paid') {
      hit.payment_status = 'paid';
      hit.status = 'paid';
      hit.fulfillment_status = hit.fulfillment_status || 'pending_ship';
    } else if (paymentStatus === 'failed') {
      hit.payment_status = 'pending';
      hit.status = 'pending_payment';
    }
  }
  if (updated > 0) await writeOrders(orders);
  return updated;
}

export async function updateOrderPaymentRefs(
  orderId: string,
  refs: {
    payso_reference_id?: string;
    payment_intent_id?: string;
    payment_source?: 'payso' | 'stub';
  },
) {
  const orders = await readOrders();
  const hit = orders.find((o) => o.order_id === orderId);
  if (!hit) return null;
  if (refs.payso_reference_id) hit.payso_reference_id = refs.payso_reference_id;
  if (refs.payment_intent_id) hit.payment_intent_id = refs.payment_intent_id;
  if (refs.payment_source) hit.payment_source = refs.payment_source;
  await writeOrders(orders);
  return hit;
}
