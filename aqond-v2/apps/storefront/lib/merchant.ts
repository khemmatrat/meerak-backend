import {
  fetchMerchantPromotions as fetchMerchantPromotionsFromApi,
  saveMerchantPromotion as saveMerchantPromotionToApi,
} from '@/lib/merchantPromos';

export const FULFILLMENT_LABELS: Record<string, string> = {
  pending_accept: 'รอร้านรับ',
  pending_ship: 'รอจัดส่ง',
  accepted: 'ร้านรับแล้ว',
  preparing: 'กำลังเตรียม',
  ready: 'พร้อมส่ง',
  shipped: 'จัดส่งแล้ว',
  delivered: 'ส่งสำเร็จ',
  rejected: 'ปฏิเสธ',
};

export const MERCHANT_ACTIONS: Record<string, { next: string; label: string }[]> = {
  pending_accept: [
    { next: 'accepted', label: 'รับออเดอร์' },
    { next: 'rejected', label: 'ปฏิเสธ' },
  ],
  pending_ship: [
    { next: 'accepted', label: 'รับออเดอร์' },
    { next: 'rejected', label: 'ปฏิเสธ' },
  ],
  accepted: [{ next: 'preparing', label: 'เริ่มเตรียม' }],
  preparing: [{ next: 'ready', label: 'พร้อมส่ง' }],
  ready: [{ next: 'shipped', label: 'ส่งมอบขนส่ง' }],
  shipped: [{ next: 'delivered', label: 'ส่งสำเร็จ' }],
};

export async function fetchMerchantDashboard(userId: string) {
  const res = await fetch(`/api/merchant/shops?user_id=${encodeURIComponent(userId)}&owner_id=${encodeURIComponent(userId)}`, {
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'โหลดข้อมูลร้านไม่สำเร็จ');
  return data as {
    accessible_shops: { id: string; name: string; type: string; status: string }[];
    pending_shops: { id: string; name: string; status: string }[];
    usage: { used: number; max: number; approved: number; pending: number; extra_slots: number };
    pending_badges: Record<string, number>;
    pending_order_ids: Record<string, string[]>;
    slot_price_baht: number;
    free_slots: number;
    max_slots: number;
  };
}

export async function createMerchantShop(input: {
  owner_id: string;
  name: string;
  type: 'food' | 'marketplace';
}) {
  const res = await fetch('/api/merchant/shops', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, action: 'create' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'สร้างร้านไม่สำเร็จ');
  return data;
}

export async function purchaseMerchantSlot(ownerId: string) {
  const res = await fetch('/api/merchant/shops/slots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ owner_id: ownerId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'ซื้อสล็อตไม่สำเร็จ');
  return data;
}

export async function approveMerchantShop(ownerId: string, shopId: string) {
  const res = await fetch('/api/merchant/shops', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'approve', owner_id: ownerId, shop_id: shopId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'อนุมัติไม่สำเร็จ');
  return data;
}

export async function fetchMerchantOrders(merchantId: string) {
  const res = await fetch(`/api/merchant/orders?merchant_id=${encodeURIComponent(merchantId)}`, {
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !data.orders) {
    throw new Error(data.error || 'โหลดคิวออเดอร์ไม่สำเร็จ');
  }
  return data as { orders: any[]; count: number; warning?: string };
}

export async function fetchMerchantMenu(merchantId: string) {
  const res = await fetch(`/api/merchant/menu?merchant_id=${encodeURIComponent(merchantId)}`, {
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'โหลดเมนูไม่สำเร็จ');
  return data as { restaurant?: unknown; menu: any[] };
}

export async function addMerchantMenuItem(input: {
  merchant_id: string;
  title: string;
  description?: string;
  price_micro: number;
  spicy?: boolean;
  options?: import('@/lib/foodOptions').FoodMenuOption[];
}) {
  const res = await fetch('/api/merchant/menu', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'เพิ่มเมนูไม่สำเร็จ');
  return data;
}

export async function deleteMerchantMenuItem(merchantId: string, itemId: string) {
  const res = await fetch(
    `/api/merchant/menu?merchant_id=${encodeURIComponent(merchantId)}&item_id=${encodeURIComponent(itemId)}`,
    { method: 'DELETE' },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'ลบเมนูไม่สำเร็จ');
  return data;
}

export type ShopOpsView = {
  effective_open: boolean;
  reason: string;
  label: string;
  ops: {
    auto_schedule: boolean;
    open_time: string;
    close_time: string;
    manual_closed: boolean;
    closed_note?: string;
    sold_out_item_ids: string[];
    auto_accept_orders?: boolean;
    busy_mode?: boolean;
    busy_extra_minutes?: number;
  };
  sold_out_item_ids?: string[];
};

export async function fetchShopOps(merchantId: string): Promise<ShopOpsView> {
  const res = await fetch(`/api/merchant/shop-ops?merchant_id=${encodeURIComponent(merchantId)}`, {
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'โหลดสถานะร้านไม่สำเร็จ');
  return data;
}

export async function updateShopOpsSettings(
  merchantId: string,
  patch: {
    auto_schedule?: boolean;
    open_time?: string;
    close_time?: string;
    manual_closed?: boolean;
    closed_note?: string;
    auto_accept_orders?: boolean;
  },
) {
  const res = await fetch('/api/merchant/shop-ops', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ merchant_id: merchantId, action: 'update', ...patch }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'บันทึกไม่สำเร็จ');
  return data;
}

export async function toggleShopEmergencyClose(
  merchantId: string,
  closed: boolean,
  note?: string,
  actor?: string,
) {
  const res = await fetch('/api/merchant/shop-ops', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchant_id: merchantId,
      action: 'manual_close',
      closed,
      note,
      actor,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'อัปเดตสถานะไม่สำเร็จ');
  return data;
}

export async function toggleItemSoldOut(
  merchantId: string,
  itemId: string,
  soldOut: boolean,
  opts?: { actor?: string; item_title?: string },
) {
  const res = await fetch('/api/merchant/shop-ops', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchant_id: merchantId,
      action: 'sold_out',
      item_id: itemId,
      sold_out: soldOut,
      actor: opts?.actor,
      item_title: opts?.item_title,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'อัปเดตสต็อกไม่สำเร็จ');
  return data;
}

export async function setShopBusyMode(merchantId: string, minutes: 0 | 15 | 30, actor?: string) {
  const res = await fetch('/api/merchant/shop-ops', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ merchant_id: merchantId, action: 'busy', minutes, actor }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'อัปเดตโหมดคิวไม่สำเร็จ');
  return data;
}

export async function runAutoAcceptOrders(merchantId: string) {
  const res = await fetch('/api/merchant/orders/auto-accept', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ merchant_id: merchantId }),
  });
  const data = await res.json().catch(() => ({}));
  return data as { accepted?: string[]; count?: number };
}

export async function bulkCategorySoldOut(
  merchantId: string,
  categoryId: string,
  soldOut: boolean,
  actor?: string,
) {
  const res = await fetch('/api/merchant/menu/bulk-sold-out', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ merchant_id: merchantId, category_id: categoryId, sold_out: soldOut, actor }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'อัปเดตหมวดไม่สำเร็จ');
  return data;
}

export async function fetchMerchantWallet(merchantId: string) {
  const res = await fetch(`/api/merchant/wallet?merchant_id=${encodeURIComponent(merchantId)}`, {
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'โหลดกระเป๋าเงินไม่สำเร็จ');
  return data as { wallet: any; fees: any };
}

export async function fetchMerchantFees(merchantId: string) {
  const res = await fetch(`/api/merchant/fees?merchant_id=${encodeURIComponent(merchantId)}`, {
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'โหลดค่าธรรมเนียมไม่สำเร็จ');
  return data;
}

export type StaffPermissions = {
  role: string;
  can_accept_orders: boolean;
  can_edit_menu: boolean;
  can_withdraw_wallet: boolean;
  can_manage_staff: boolean;
  can_manage_shop_settings: boolean;
};

export async function fetchStaffAccess(ownerId: string, merchantId: string, userId: string) {
  const q = new URLSearchParams({ owner_id: ownerId, merchant_id: merchantId, user_id: userId });
  const res = await fetch(`/api/merchant/staff?${q}`, { cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'โหลดสิทธิ์ไม่สำเร็จ');
  return data as { members: any[]; permissions: StaffPermissions };
}

export async function addStaffMember(input: {
  owner_id: string;
  user_id: string;
  display_name: string;
  shop_ids?: string[];
}) {
  const res = await fetch('/api/merchant/staff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, action: 'add' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'เพิ่มพนักงานไม่สำเร็จ');
  return data;
}

export async function removeStaffMember(ownerId: string, staffId: string) {
  const res = await fetch('/api/merchant/staff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ owner_id: ownerId, action: 'remove', staff_id: staffId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'ลบไม่สำเร็จ');
  return data;
}

export async function fetchMerchantProducts(merchantId: string) {
  const res = await fetch(`/api/merchant/products?merchant_id=${encodeURIComponent(merchantId)}`, {
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'โหลดสินค้าไม่สำเร็จ');
  return data as { products: { id: string; title: string; price_micro: number; sold_out?: boolean }[] };
}

export async function fetchTodaySales(merchantId: string) {
  const res = await fetch(`/api/merchant/sales/today?merchant_id=${encodeURIComponent(merchantId)}`, {
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'โหลดยอดขายไม่สำเร็จ');
  return data;
}

export async function fetchSalesAnalytics(merchantId: string) {
  const res = await fetch(`/api/merchant/sales/analytics?merchant_id=${encodeURIComponent(merchantId)}`, {
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'โหลดวิเคราะห์ไม่สำเร็จ');
  return data;
}

export function fetchMerchantPromotions(merchantId: string) {
  return fetchMerchantPromotionsFromApi(merchantId);
}

export function saveMerchantPromotion(
  input: Parameters<typeof saveMerchantPromotionToApi>[0],
) {
  return saveMerchantPromotionToApi(input);
}

export async function fetchMerchantAudit(merchantId: string) {
  const res = await fetch(`/api/merchant/audit?merchant_id=${encodeURIComponent(merchantId)}`, {
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'โหลด audit ไม่สำเร็จ');
  return data;
}

export async function updateOrderFulfillment(
  orderId: string,
  status: string,
  opts?: { note?: string; tracking_no?: string; actor?: string },
) {
  const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/fulfillment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status,
      note: opts?.note,
      tracking_no: opts?.tracking_no,
      actor: opts?.actor || 'merchant',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.detail || 'อัปเดตสถานะไม่สำเร็จ');
  return data;
}

export async function fetchParcelTrack(trackingNo: string) {
  const res = await fetch(
    `/api/shipping/track?tracking_no=${encodeURIComponent(trackingNo)}`,
    { cache: 'no-store' },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'ติดตามพัสดุไม่สำเร็จ');
  return data;
}

export async function fetchMerchantDisputes(merchantId: string) {
  const res = await fetch(`/api/merchant/disputes?merchant_id=${encodeURIComponent(merchantId)}`, {
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'โหลดศูนย์ช่วยเหลือไม่สำเร็จ');
  return data;
}

export async function respondToDispute(
  caseId: string,
  input: {
    response: string;
    accept_platform?: boolean;
    propose_mutual?: boolean;
    mutual_refund_micro?: number;
  },
) {
  const res = await fetch(`/api/merchant/disputes/${encodeURIComponent(caseId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'ส่งคำตอบไม่สำเร็จ');
  return data;
}

export async function submitProductReview(input: {
  product_id: string;
  merchant_id: string;
  author_id: string;
  order_id: string;
  rating: number;
  title?: string;
  body?: string;
}) {
  const res = await fetch('/api/reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'ส่งรีวิวไม่สำเร็จ');
  return data;
}
