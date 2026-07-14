import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const FILE = path.join(process.cwd(), '.data', 'dev', 'shop-chats.json');

export type ShopChatFrom = 'buyer' | 'shop' | 'ai';

export type ShopChatMessage = {
  id: string;
  shop_id: string;
  buyer_id: string;
  from: ShopChatFrom;
  text: string;
  created_at: string;
};

type Store = { threads: Record<string, ShopChatMessage[]> };

function threadKey(shopId: string, buyerId: string) {
  return `${buyerId}::${shopId}`;
}

async function readStore(): Promise<Store> {
  try {
    const raw = JSON.parse(await fs.readFile(FILE, 'utf8')) as Store;
    return { threads: raw.threads || {} };
  } catch {
    return { threads: {} };
  }
}

async function writeStore(store: Store) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(store, null, 2), 'utf8');
}

export async function listShopChatMessages(shopId: string, buyerId: string): Promise<ShopChatMessage[]> {
  const store = await readStore();
  return store.threads[threadKey(shopId, buyerId)] || [];
}

export type ShopChatThreadSummary = {
  shop_id: string;
  buyer_id: string;
  last_message: string;
  last_at: string;
};

export async function listBuyerChatThreads(buyerId: string): Promise<ShopChatThreadSummary[]> {
  const store = await readStore();
  const prefix = `${buyerId}::`;
  const threads: ShopChatThreadSummary[] = [];
  for (const [key, msgs] of Object.entries(store.threads)) {
    if (!key.startsWith(prefix) || msgs.length === 0) continue;
    const shopId = key.slice(prefix.length);
    const last = msgs[msgs.length - 1];
    threads.push({
      shop_id: shopId,
      buyer_id: buyerId,
      last_message: last.text,
      last_at: last.created_at,
    });
  }
  return threads.sort((a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime());
}

export async function addShopChatMessage(
  shopId: string,
  buyerId: string,
  from: ShopChatFrom,
  text: string,
): Promise<ShopChatMessage> {
  const store = await readStore();
  const key = threadKey(shopId, buyerId);
  const msg: ShopChatMessage = {
    id: crypto.randomUUID(),
    shop_id: shopId,
    buyer_id: buyerId,
    from,
    text,
    created_at: new Date().toISOString(),
  };
  if (!store.threads[key]) store.threads[key] = [];
  store.threads[key].push(msg);
  await writeStore(store);
  return msg;
}

export function autoReplyForBuyerText(text: string): string {
  const t = text.trim();
  if (t.includes('ติดตามสถานะ') || t.includes('สถานะสินค้า')) {
    return 'คุณสามารถติดตามสถานะคำสั่งซื้อได้ที่เมนู "การซื้อของฉัน" หรือแจ้งเลขคำสั่งซื้อให้เราตรวจสอบได้เลยค่ะ';
  }
  if (t.includes('ระยะเวลาจัดส่ง') || t.includes('จัดส่งโดยประมาณ')) {
    return 'โดยปกติร้านจัดส่งภายใน 2–4 วันทำการหลังยืนยันคำสั่งซื้อ หากต้องการเร่งด่วนแจ้งได้เลยนะคะ';
  }
  if (t.includes('ขนส่ง') || t.includes('ติดต่อบริษัท')) {
    return 'หลังร้านจัดส่งแล้ว คุณจะได้เลขพัสดุและลิงก์ติดตามในรายละเอียดคำสั่งซื้อ หรือแจ้งเลขออเดอร์เพื่อให้เราช่วยตรวจสอบได้ค่ะ';
  }
  if (t.includes('ใบเสร็จ') || t.includes('ใบกำกับภาษี')) {
    return 'ดาวน์โหลดใบเสร็จ/ใบกำกับภาษีได้จากหน้ารายละเอียดคำสั่งซื้อหลังชำระเงินสำเร็จ หากต้องการเอกสารเพิ่มเติม แจ้งเลขคำสั่งซื้อได้เลยค่ะ';
  }
  if (t.includes('ปัญหา') || t.includes('เสียหาย') || t.includes('ไม่ครบ')) {
    return 'ขออภัยในความไม่สะดวกค่ะ กรุณาแจ้งเลขคำสั่งซื้อ พร้อมรูปสินค้า/บรรจุภัณฑ์ เราจะช่วยตรวจสอบและแก้ไขให้เร็วที่สุด';
  }
  if (t.includes('เจ้าหน้าที่') || t.includes('คุยกับร้าน')) {
    return 'ได้เลยค่ะ กำลังส่งต่อให้เจ้าหน้าที่ร้านค้า โปรดรอสักครู่หรือพิมพ์รายละเอียดที่ต้องการสอบถามได้เลย';
  }
  return 'รับทราบค่ะ ทีมร้านค้าจะตอบกลับโดยเร็วที่สุด หากเร่งด่วนกด "แชทกับเจ้าหน้าที่ของร้านค้า" ได้เลยนะคะ';
}
