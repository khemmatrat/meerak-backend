import { kongBase } from '@/lib/server-env';

const NOTIFY_URL = process.env.NOTIFICATION_URL || `${kongBase()}/api/v1/notify`;

export async function sendOrderNotification(input: {
  recipient_id: string;
  template_key: string;
  payload?: Record<string, string>;
  channel?: 'push' | 'line' | 'inapp';
}) {
  try {
    await fetch(`${NOTIFY_URL}/v1/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Aqond-Region': 'TH' },
      body: JSON.stringify({
        recipient_id: input.recipient_id,
        region: 'TH',
        locale: 'th-TH',
        channel: input.channel || 'push',
        template_key: input.template_key,
        payload: input.payload || {},
        consent_purpose: 'transactional',
      }),
      cache: 'no-store',
    });
  } catch {
    /* best-effort */
  }
}

async function notifyDual(
  recipientId: string,
  templateKey: string,
  payload: Record<string, string>,
) {
  await sendOrderNotification({ recipient_id: recipientId, template_key: templateKey, payload });
  await sendOrderNotification({
    recipient_id: recipientId,
    template_key: templateKey,
    channel: 'line',
    payload,
  });
}

export async function notifyOrderAccepted(buyerId: string, orderId: string) {
  await notifyDual(buyerId, 'order_accepted', { order_id: orderId });
}

export async function notifyFoodReady(buyerId: string, orderId: string) {
  await notifyDual(buyerId, 'food_ready', { order_id: orderId });
}

export async function notifyMerchantPreparing(buyerId: string, orderId: string) {
  await notifyDual(buyerId, 'merchant_preparing', { order_id: orderId });
}

export async function notifyRiderEnRoute(buyerId: string, orderId: string) {
  await notifyDual(buyerId, 'rider_en_route', { order_id: orderId });
}

export async function notifyRiderArrived(buyerId: string, orderId: string) {
  await notifyDual(buyerId, 'rider_arrived', { order_id: orderId });
}

export async function notifyMerchantNewOrder(
  ownerId: string,
  orderId: string,
  merchantName: string,
) {
  if (!ownerId || ownerId === '*') return;
  await notifyDual(ownerId, 'merchant_new_order', {
    order_id: orderId,
    merchant_name: merchantName,
  });
}
