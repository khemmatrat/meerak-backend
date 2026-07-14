import { listOrdersForBuyer, type StoredOrder } from '@/lib/server/orderStore';
import { listPendingReviewItems } from '@/lib/server/reviewService';

const DEMO_RATE_CATALOG = [
  {
    title: 'หมูหยองไก่หยอง กล่อง 500g',
    merchant_id: 'moo-yong-factory',
    merchant_name: 'หมูหยองไก่หยอง โรงงาน ปลีกส่ง',
    amount_micro: 18900,
    image_hint: 'หมูหยอง',
  },
  {
    title: 'เสื้อยืดคอกลม ผ้าฝ้าย 100%',
    merchant_id: 'sino-family-shop',
    merchant_name: 'Sino_Family_Shop',
    amount_micro: 9900,
    image_hint: 'เสื้อ',
  },
  {
    title: 'ครีมบำรุงผิว Vitamin C 30ml',
    merchant_id: 'beauty-th-shop',
    merchant_name: 'BeautyTH Official',
    amount_micro: 29900,
    image_hint: 'cream',
  },
  {
    title: 'หูฟังบลูทูธ ตัดเสียงรบกวน',
    merchant_id: 'xinY-shop',
    merchant_name: 'XinY_Shop',
    amount_micro: 89000,
    image_hint: 'หูฟัง',
  },
] as const;

function devSeedAllowed() {
  return process.env.AQOND_LOCAL_DEV === '1' || process.env.NODE_ENV === 'development';
}

async function ensureDemoRateOrders(buyerId: string): Promise<StoredOrder[]> {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const file = path.join(process.cwd(), '.data', 'orders.json');
  let db = { orders: await listOrdersForBuyer(buyerId), idempotency: {} as Record<string, string> };
  try {
    const raw = JSON.parse(await fs.readFile(file, 'utf8'));
    db = { orders: raw.orders || [], idempotency: raw.idempotency || {} };
  } catch {
    /* fresh */
  }

  const now = Date.now();
  for (let i = 0; i < DEMO_RATE_CATALOG.length; i++) {
    const cat = DEMO_RATE_CATALOG[i];
    const orderId = `ord-demo-rate-${buyerId.slice(-6)}-${i + 1}`;
    if (db.orders.some((o) => o.order_id === orderId)) continue;
    db.orders.push({
      order_id: orderId,
      buyer_id: buyerId,
      merchant_id: cat.merchant_id,
      merchant_name: cat.merchant_name,
      status: 'completed',
      payment_status: 'paid',
      amount_micro: cat.amount_micro,
      method: 'promptpay',
      order_type: 'marketplace',
      fulfillment_status: 'delivered',
      tracking_no: `SPXTH0${String(8844221100 + i)}`,
      carrier_id: 'flash',
      created_at: new Date(now - (i + 1) * 86400000).toISOString(),
      items: [
        {
          product_id: `demo-rate-p-${i + 1}`,
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

/** Dev/demo — ensure delivered orders awaiting review exist. */
export async function seedDemoPendingReviews(buyerId: string) {
  if (!devSeedAllowed()) {
    const pending = await listPendingReviewItems(buyerId);
    return { seeded: 0, skipped: 'not_dev', pending_count: pending.length };
  }

  await ensureDemoRateOrders(buyerId);
  const pending = await listPendingReviewItems(buyerId);
  return { seeded: DEMO_RATE_CATALOG.length, pending_count: pending.length };
}
