import fs from 'fs/promises';
import path from 'path';
import { orderApi } from '@/lib/server/merchantApi';
import { allowLocalOrders } from '@/lib/server-env';
import { handoffOrderToDispatch, isOnDemandDispatch } from '@/lib/server/dispatchHandoff';
import { createShippingLabelForOrder } from '@/lib/server/shippingLabel';
import {
  notifyOrderAccepted,
  notifyRiderEnRoute,
  notifyRiderArrived,
  notifyFoodReady,
  notifyMerchantPreparing,
} from '@/lib/server/notifyEvents';
import { appendAqondEvent, fulfillmentStatusToEvent } from '@/lib/server/aqondEventBus';

const FULFILLMENT_FILE = path.join(process.cwd(), '.data', 'dev', 'merchant-fulfillment.json');

export type MerchantOrderView = {
  order_id: string;
  id: string;
  buyer_id?: string;
  merchant_id: string;
  status: string;
  fulfillment_status: string;
  amount_micro: number;
  total_micro: number;
  items?: unknown[];
  recipient?: string;
  phone?: string;
  tracking_no?: string;
  order_type?: string;
  carrier_id?: string;
  merchant_name?: string;
  created_at?: string;
  delivered_at?: string;
  source: string;
};

type FulfillmentStore = Record<
  string,
  { fulfillment_status: string; updated_at: string; delivered_at?: string; tracking_no?: string }
>;

async function readFulfillment(): Promise<FulfillmentStore> {
  try {
    return JSON.parse(await fs.readFile(FULFILLMENT_FILE, 'utf8'));
  } catch {
    return {};
  }
}

async function writeFulfillment(store: FulfillmentStore) {
  await fs.mkdir(path.dirname(FULFILLMENT_FILE), { recursive: true });
  await fs.writeFile(FULFILLMENT_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function applyFulfillment(o: MerchantOrderView, fb: FulfillmentStore): MerchantOrderView {
  const hit = fb[o.order_id];
  if (!hit) return o;
  return {
    ...o,
    fulfillment_status: hit.fulfillment_status,
    tracking_no: hit.tracking_no || o.tracking_no,
    delivered_at: hit.delivered_at,
  };
}

async function fetchRemoteMerchantOrders(merchantId: string): Promise<MerchantOrderView[]> {
  const res = await fetch(
    `${orderApi('/v1/orders/merchant')}?merchant_id=${encodeURIComponent(merchantId)}`,
    { headers: { 'X-Aqond-Region': 'TH' }, cache: 'no-store', signal: AbortSignal.timeout(4_000) },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `order_svc_${res.status}`);
  return ((data.orders || []) as Record<string, unknown>[]).map((o) => ({
    order_id: String(o.order_id || o.id),
    id: String(o.order_id || o.id),
    buyer_id: o.buyer_id as string | undefined,
    merchant_id: merchantId,
    status: String(o.status || 'confirmed'),
    fulfillment_status: String(o.fulfillment_status || 'pending_accept'),
    amount_micro: Number(o.amount_micro || o.total_micro || 0),
    total_micro: Number(o.total_micro || o.amount_micro || 0),
    items: (o.items as unknown[]) || [],
    recipient: o.recipient as string | undefined,
    phone: o.phone as string | undefined,
    tracking_no: o.tracking_no as string | undefined,
    order_type: o.order_type as string | undefined,
    carrier_id: (o.carrier_id as string | undefined) || undefined,
    merchant_name: o.merchant_name as string | undefined,
    created_at: o.created_at as string | undefined,
    source: 'order-svc',
  }));
}

async function loadLocalMerchantOrders(merchantId: string): Promise<MerchantOrderView[]> {
  const { listOrdersForMerchant } = await import('@/lib/server/orderStore');
  const orders = await listOrdersForMerchant(merchantId);
  return orders.map((o) => ({
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
    tracking_no: o.tracking_no,
    order_type: o.order_type,
    merchant_name: o.merchant_name,
    created_at: o.created_at,
    source: 'local',
  }));
}

export async function listMerchantOrders(merchantId: string) {
  const fb = await readFulfillment();
  let remote: MerchantOrderView[] = [];
  let warning: string | undefined;

  try {
    remote = await fetchRemoteMerchantOrders(merchantId);
  } catch (e: unknown) {
    warning = e instanceof Error ? e.message : 'order_svc_unreachable';
  }

  const local = allowLocalOrders() ? await loadLocalMerchantOrders(merchantId) : [];
  const seen = new Set(remote.map((o) => o.order_id));
  const merged = [
    ...remote.map((o) => applyFulfillment(o, fb)),
    ...local.filter((o) => !seen.has(o.order_id)).map((o) => applyFulfillment(o, fb)),
  ].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

  return { merchant_id: merchantId, orders: merged, count: merged.length, warning };
}

async function fetchOrderForDispatch(orderId: string): Promise<MerchantOrderView | null> {
  try {
    const res = await fetch(orderApi(`/v1/orders/${orderId}`), {
      headers: { 'X-Aqond-Region': 'TH' },
      cache: 'no-store',
    });
    const o = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    const order = (o.order || o) as Record<string, unknown>;
    return {
      order_id: String(order.order_id || order.id || orderId),
      id: String(order.order_id || order.id || orderId),
      buyer_id: order.buyer_id as string | undefined,
      merchant_id: String(order.merchant_id || ''),
      status: String(order.status || 'confirmed'),
      fulfillment_status: String(order.fulfillment_status || ''),
      amount_micro: Number(order.amount_micro || order.total_micro || 0),
      total_micro: Number(order.total_micro || order.amount_micro || 0),
      items: (order.items as unknown[]) || [],
      recipient: order.recipient as string | undefined,
      phone: order.phone as string | undefined,
      order_type: order.order_type as string | undefined,
      carrier_id: order.carrier_id as string | undefined,
      merchant_name: order.merchant_name as string | undefined,
      source: 'order-svc',
    };
  } catch {
    if (!allowLocalOrders()) return null;
    const { getOrderById } = await import('@/lib/server/orderStore');
    const o = await getOrderById(orderId);
    if (!o) return null;
    return {
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
  }
}

async function emitFulfillmentEvent(
  orderId: string,
  status: string,
  opts?: { actor?: string; merchant_id?: string },
) {
  const evt = fulfillmentStatusToEvent(status);
  if (!evt) return;
  await appendAqondEvent({
    order_id: orderId,
    event_type: evt,
    source: 'order-svc',
    actor: opts?.actor || 'merchant',
    merchant_id: opts?.merchant_id,
    phase: status,
  });
}

async function handoffIfOnDemand(orderId: string, status: string) {
  const hit = await fetchOrderForDispatch(orderId);
  if (!hit || !isOnDemandDispatch(hit)) return;
  const phase =
    status === 'ready' || status === 'shipped' ? 'ready' : status;
  await handoffOrderToDispatch(hit, phase);
}

export async function updateMerchantFulfillment(
  orderId: string,
  status: string,
  opts?: { note?: string; tracking_no?: string; actor?: string },
) {
  try {
    const res = await fetch(`${orderApi(`/v1/orders/${orderId}/fulfillment`)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Aqond-Region': 'TH' },
      body: JSON.stringify({
        status,
        note: opts?.note,
        tracking_no: opts?.tracking_no,
        actor: opts?.actor || 'merchant',
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const fb = await readFulfillment();
      fb[orderId] = {
        fulfillment_status: status,
        updated_at: new Date().toISOString(),
        delivered_at: status === 'delivered' ? new Date().toISOString() : fb[orderId]?.delivered_at,
        tracking_no: opts?.tracking_no || fb[orderId]?.tracking_no,
      };
      await writeFulfillment(fb);

      if (['ready', 'preparing', 'accepted', 'shipped'].includes(status)) {
        await handoffIfOnDemand(orderId, status);
      }

      const hitForEvt = await fetchOrderForDispatch(orderId);
      await emitFulfillmentEvent(orderId, status, {
        actor: opts?.actor,
        merchant_id: hitForEvt?.merchant_id,
      });

      if (status === 'accepted') {
        const hit = await fetchOrderForDispatch(orderId);
        if (hit?.buyer_id) {
          await notifyOrderAccepted(hit.buyer_id, orderId);
        }
      }

      if (status === 'preparing') {
        const hit = await fetchOrderForDispatch(orderId);
        if (hit?.buyer_id) {
          await notifyMerchantPreparing(hit.buyer_id, orderId);
        }
      }

      if (status === 'ready') {
        const hit = await fetchOrderForDispatch(orderId);
        if (hit?.buyer_id) {
          await notifyFoodReady(hit.buyer_id, orderId);
        }
      }

      if (status === 'shipped') {
        const hit = await fetchOrderForDispatch(orderId);
        if (hit?.buyer_id) {
          await notifyRiderEnRoute(hit.buyer_id, orderId);
        }
      }

      if (status === 'delivered') {
        const hit = await fetchOrderForDispatch(orderId);
        if (hit?.buyer_id) {
          await notifyRiderArrived(hit.buyer_id, orderId);
        }
      }

      if (status === 'shipped' && !opts?.tracking_no) {
        const hit = await fetchOrderForDispatch(orderId);
        if (hit && !isOnDemandDispatch(hit)) {
          const items = Array.isArray(hit.items) ? hit.items : [];
          const first = items[0] as { product_id?: string } | undefined;
          const label = await createShippingLabelForOrder({
            order_id: orderId,
            merchant_id: hit.merchant_id,
            carrier_id: hit.carrier_id,
            item_micro: hit.amount_micro,
            product_id: first?.product_id,
          });
          if (label?.tracking_no) {
            await fetch(`${orderApi(`/v1/orders/${orderId}/fulfillment`)}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Aqond-Region': 'TH' },
              body: JSON.stringify({
                status: 'shipped',
                tracking_no: label.tracking_no,
                actor: opts?.actor || 'merchant',
              }),
            });
            fb[orderId] = { ...fb[orderId], tracking_no: label.tracking_no };
            await writeFulfillment(fb);
          }
        }
      }

      return { ...data, source: 'order-svc' };
    }
    if (!allowLocalOrders()) {
      throw new Error(data.error || data.detail || `http_${res.status}`);
    }
  } catch (e: unknown) {
    if (!allowLocalOrders()) throw e;
  }

  const fb = await readFulfillment();
  fb[orderId] = {
    fulfillment_status: status,
    updated_at: new Date().toISOString(),
    delivered_at: status === 'delivered' ? new Date().toISOString() : fb[orderId]?.delivered_at,
    tracking_no: opts?.tracking_no || fb[orderId]?.tracking_no,
  };
  await writeFulfillment(fb);

  const { updateLocalOrderFulfillment } = await import('@/lib/server/orderStore');
  await updateLocalOrderFulfillment(orderId, status, opts?.tracking_no);

  if (['ready', 'preparing', 'accepted', 'shipped'].includes(status)) {
    await handoffIfOnDemand(orderId, status);
  }

  const hitForEvt = await fetchOrderForDispatch(orderId);
  await emitFulfillmentEvent(orderId, status, {
    actor: opts?.actor,
    merchant_id: hitForEvt?.merchant_id,
  });

  if (status === 'shipped' && !opts?.tracking_no) {
    const hit = await fetchOrderForDispatch(orderId);
    if (hit && !isOnDemandDispatch(hit)) {
      const items = Array.isArray(hit.items) ? hit.items : [];
      const first = items[0] as { product_id?: string } | undefined;
      const label = await createShippingLabelForOrder({
        order_id: orderId,
        merchant_id: hit.merchant_id,
        carrier_id: hit.carrier_id,
        item_micro: hit.amount_micro,
        product_id: first?.product_id,
      });
      if (label?.tracking_no) {
        fb[orderId] = { ...fb[orderId], tracking_no: label.tracking_no };
        await writeFulfillment(fb);
        await updateLocalOrderFulfillment(orderId, status, label.tracking_no);
      }
    }
  }

  return { order_id: orderId, fulfillment_status: status, updated: true, source: 'local' };
}

export async function getTodaySales(merchantId: string) {
  const { getMerchantFeeSummary } = await import('@/lib/server/merchantFeeEngine');
  const { bangkokDateKey } = await import('@/lib/server/thaiTime');
  const { orders } = await listMerchantOrders(merchantId);
  const todayKey = bangkokDateKey();

  const delivered = orders.filter((o) => {
    if (o.fulfillment_status !== 'delivered' && o.status !== 'completed') return false;
    const at = o.delivered_at || o.created_at;
    if (!at) return false;
    return bangkokDateKey(new Date(at)) === todayKey;
  });

  const revenue = delivered.reduce((s, o) => s + (o.amount_micro || 0), 0);
  const orderCount = delivered.length;
  const itemCount = delivered.reduce((n, o) => {
    const items = Array.isArray(o.items) ? o.items : [];
    return n + items.reduce((s, it: any) => s + (it.qty || 1), 0);
  }, 0);

  const fees = await getMerchantFeeSummary(merchantId);
  const todayFees = fees.today;

  return {
    merchant_id: merchantId,
    date: todayKey,
    order_count: orderCount,
    item_count: itemCount,
    revenue_micro: revenue,
    fee_micro: todayFees?.total_fee_micro || 0,
    net_micro: todayFees?.net_revenue_micro ?? revenue,
    fee_lines: todayFees?.lines || [],
    fee_summary: fees.month,
    orders: delivered,
  };
}
