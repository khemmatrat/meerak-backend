import { listOrdersForBuyer } from '@/lib/server/orderStore';
import type { StoredOrder } from '@/lib/server/orderStore';
import {
  listReturnsForBuyer,
  listReturnsForOrder,
  updateRefundRecord,
  updateReturnRequest,
} from '@/lib/server/returnStore';
import { orderEligibleForReturn, submitReturnRequest } from '@/lib/server/returnService';
import type { ReturnReasonCode } from '@aqond/return-core';

const DEMO_CATALOG = [
  {
    title: 'กรรไกรตัดผมมืออาชีพ 6.5 นิ้ว',
    variation: 'อัตราบางสีเขียว 25%',
    image_url: 'https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=200&h=200&fit=crop',
    amount_micro: 31000,
  },
  {
    title: 'โทรศัพท์มือถือ V29 5G แรม 16GB',
    variation: 'purple, 128GB',
    image_url: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=200&h=200&fit=crop',
    amount_micro: 11690000,
  },
  {
    title: 'ชา Matcha ออร์แกนิก พรีเมียม',
    variation: 'ขนาด 100g',
    image_url: 'https://images.unsplash.com/photo-1515823064-d6e0c04616a7?w=200&h=200&fit=crop',
    amount_micro: 29900,
  },
  {
    title: 'เสื้อเชิ้ตผ้าฝ้าย AQOND',
    variation: 'ขาว, L',
    image_url: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=200&h=200&fit=crop',
    amount_micro: 19900,
  },
] as const;

const DEMO_SCENARIOS: Array<{
  reason: ReturnReasonCode;
  return_state: string;
  refund_state: string;
  status_label: string;
}> = [
  { reason: 'damaged', return_state: 'requested', refund_state: 'escrow_held', status_label: 'อยู่ระหว่างการคืนเงิน' },
  { reason: 'wrong_item', return_state: 'approved', refund_state: 'processing', status_label: 'อยู่ระหว่างการคืนเงิน' },
  { reason: 'not_as_described', return_state: 'refund_pending', refund_state: 'processing', status_label: 'รอคืนเงิน' },
  { reason: 'changed_mind', return_state: 'refund_completed', refund_state: 'completed', status_label: 'คืนเงินแล้ว' },
];

function devSeedAllowed() {
  return process.env.AQOND_LOCAL_DEV === '1' || process.env.NODE_ENV === 'development';
}

async function ensureDemoOrders(buyerId: string): Promise<StoredOrder[]> {
  const existing = await listOrdersForBuyer(buyerId);
  const marketplace = existing.filter(
    (o) => o.order_type !== 'food' && !String(o.merchant_id || '').startsWith('food-'),
  );

  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const file = path.join(process.cwd(), '.data', 'orders.json');
  let db = { orders: existing, idempotency: {} as Record<string, string> };
  try {
    db = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    /* fresh */
  }

  const now = Date.now();
  for (let i = 0; i < DEMO_CATALOG.length; i++) {
    const cat = DEMO_CATALOG[i];
    const orderId = `ord-demo-rr-${buyerId.slice(-6)}-${i + 1}`;
    const has = db.orders.some((o) => o.order_id === orderId);
    if (has) continue;
    db.orders.push({
      order_id: orderId,
      buyer_id: buyerId,
      merchant_id: i % 2 === 0 ? 'aqm-demo' : 'xinY-shop',
      merchant_name: i % 2 === 0 ? 'ร้านค้า Aqond Demo' : 'XinY_Shop',
      status: 'paid',
      payment_status: 'paid',
      amount_micro: cat.amount_micro,
      method: i === 3 ? 'cod' : 'promptpay',
      order_type: 'marketplace',
      fulfillment_status: 'delivered',
      tracking_no: `SPXTH0${String(65385308686 + i)}`,
      carrier_id: 'flash',
      created_at: new Date(now - (i + 2) * 86400000).toISOString(),
      items: [
        {
          product_id: `demo-p-${i + 1}`,
          title: cat.title,
          qty: 1,
          unit_price_micro: cat.amount_micro,
        },
      ],
      recipient: 'ลูกค้า AQOND',
      shipping_address: 'กรุงเทพมหานคร',
      phone: '0915998751',
    });
  }

  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(db, null, 2), 'utf8');
  return listOrdersForBuyer(buyerId);
}

/** Dev/demo — seed real return+refund records via Return Core APIs. */
export async function seedDemoReturnsForBuyer(buyerId: string) {
  if (!devSeedAllowed()) {
    return { seeded: 0, skipped: 'not_dev', returns: await listReturnsForBuyer(buyerId) };
  }

  let current = await listReturnsForBuyer(buyerId);
  if (current.length >= DEMO_SCENARIOS.length) {
    return { seeded: 0, count: current.length, returns: current };
  }

  const orders = await ensureDemoOrders(buyerId);
  const eligible = orders.filter((o) => orderEligibleForReturn(o as Parameters<typeof orderEligibleForReturn>[0]));

  let seeded = 0;
  for (let i = 0; i < DEMO_SCENARIOS.length; i++) {
    const order = eligible[i];
    if (!order) break;

    const existing = await listReturnsForOrder(order.order_id, buyerId);
    const active = existing.find((r) => !['rejected', 'cancelled'].includes(r.state));
    if (active) continue;

    const scenario = DEMO_SCENARIOS[i];
    try {
      const saved = await submitReturnRequest({
        order_id: order.order_id,
        buyer_id: buyerId,
        merchant_id: order.merchant_id,
        reason_code: scenario.reason,
        return_method: 'home_pickup',
        detail: `Demo return scenario ${i + 1}`,
      });

      if (saved.refund_id) {
        await updateReturnRequest(saved.return_id, { state: scenario.return_state });
        await updateRefundRecord(saved.refund_id, {
          state: scenario.refund_state,
          ...(scenario.refund_state === 'completed'
            ? { completed_at: new Date().toISOString() }
            : {}),
        });
      }
      seeded += 1;
    } catch {
      /* duplicate or ineligible — skip */
    }
  }

  current = await listReturnsForBuyer(buyerId);
  return { seeded, count: current.length, returns: current };
}

export function demoProductMeta(orderId: string) {
  const idx = parseInt(orderId.slice(-1), 10) - 1;
  const cat = DEMO_CATALOG[idx] || DEMO_CATALOG[0];
  return cat;
}
