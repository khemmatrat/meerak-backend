import fs from 'fs/promises';
import path from 'path';
import { appendAqondEvent } from '@/lib/server/aqondEventBus';
import { updateLocalOrderFulfillment, setBuyerConfirmedAt } from '@/lib/server/orderStore';

const CONFIRM_INDEX = path.join(process.cwd(), '.data', 'dev', 'food-delivery-confirms.json');

export type FoodDeliveryConfirm = {
  order_id: string;
  buyer_id?: string;
  rider_delivered_at?: string;
  customer_confirmed_at?: string;
  confirm_method?: 'manual' | 'auto';
  auto_confirm_at?: string;
};

type ConfirmIndex = Record<string, FoodDeliveryConfirm>;

const POST_DELIVERY_PHASES = new Set([
  'rider_completed',
  'review_pending',
  'awaiting_customer_confirm',
  'cod_payment',
  'handoff',
  'photo_proof',
  'completed',
]);

export function isFoodCustomerConfirmRequired(): boolean {
  return process.env.FOOD_CUSTOMER_CONFIRM !== 'false';
}

export function getFoodAutoConfirmMinutes(): number {
  const raw = Number(process.env.FOOD_AUTO_CONFIRM_MINUTES ?? 15);
  if (!Number.isFinite(raw) || raw < 0) return 15;
  return raw;
}

async function readIndex(): Promise<ConfirmIndex> {
  try {
    return JSON.parse(await fs.readFile(CONFIRM_INDEX, 'utf8')) as ConfirmIndex;
  } catch {
    return {};
  }
}

async function writeIndex(index: ConfirmIndex) {
  await fs.mkdir(path.dirname(CONFIRM_INDEX), { recursive: true });
  await fs.writeFile(CONFIRM_INDEX, JSON.stringify(index, null, 2), 'utf8');
}

export async function getConfirmState(orderId: string): Promise<FoodDeliveryConfirm | null> {
  const index = await readIndex();
  return index[orderId] || null;
}

export function isPostDeliveryPhase(phase: string): boolean {
  return POST_DELIVERY_PHASES.has(phase);
}

export async function markRiderDelivered(orderId: string, buyerId?: string): Promise<FoodDeliveryConfirm> {
  const index = await readIndex();
  const existing = index[orderId];
  if (existing?.rider_delivered_at) return existing;

  const now = new Date().toISOString();
  const autoMinutes = getFoodAutoConfirmMinutes();
  const autoAt = new Date(Date.now() + autoMinutes * 60_000).toISOString();
  const record: FoodDeliveryConfirm = {
    order_id: orderId,
    buyer_id: buyerId || existing?.buyer_id,
    rider_delivered_at: now,
    auto_confirm_at: autoAt,
    customer_confirmed_at: existing?.customer_confirmed_at,
    confirm_method: existing?.confirm_method,
  };
  index[orderId] = record;
  await writeIndex(index);
  return record;
}

async function finalizeCustomerConfirm(
  orderId: string,
  method: 'manual' | 'auto',
  buyerId?: string,
): Promise<FoodDeliveryConfirm> {
  const index = await readIndex();
  const existing = index[orderId] || { order_id: orderId };
  if (existing.customer_confirmed_at) return existing;

  const now = new Date().toISOString();
  const record: FoodDeliveryConfirm = {
    ...existing,
    order_id: orderId,
    buyer_id: buyerId || existing.buyer_id,
    customer_confirmed_at: now,
    confirm_method: method,
  };
  index[orderId] = record;
  await writeIndex(index);

  await setBuyerConfirmedAt(orderId, now);
  await updateLocalOrderFulfillment(orderId, 'delivered');

  await appendAqondEvent({
    order_id: orderId,
    event_type: 'order.customer_confirmed',
    source: 'storefront',
    actor: buyerId || existing.buyer_id,
    payload: { method, auto_confirm_at: existing.auto_confirm_at },
  });

  return record;
}

export async function confirmDelivery(
  orderId: string,
  input: { buyerId?: string; method?: 'manual' | 'auto' } = {},
): Promise<FoodDeliveryConfirm> {
  const state = await getConfirmState(orderId);
  if (!state?.rider_delivered_at) {
    throw new Error('delivery_not_ready');
  }
  if (state.customer_confirmed_at) return state;
  return finalizeCustomerConfirm(orderId, input.method || 'manual', input.buyerId);
}

export async function processAutoConfirmIfDue(orderId: string): Promise<FoodDeliveryConfirm | null> {
  if (!isFoodCustomerConfirmRequired()) return null;
  const state = await getConfirmState(orderId);
  if (!state?.rider_delivered_at || state.customer_confirmed_at || !state.auto_confirm_at) {
    return state;
  }
  if (new Date(state.auto_confirm_at).getTime() > Date.now()) return state;
  return finalizeCustomerConfirm(orderId, 'auto', state.buyer_id);
}

export async function enrichTrackingWithConfirm(
  orderId: string,
  view: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const phase = String(view.phase || '');
  if (!isPostDeliveryPhase(phase)) return view;

  if (!view.rider_delivered_at && isPostDeliveryPhase(phase)) {
    await markRiderDelivered(orderId, view.buyer_id as string | undefined);
  }

  await processAutoConfirmIfDue(orderId);
  const confirm = await getConfirmState(orderId);

  if (confirm) {
    view.rider_delivered_at = confirm.rider_delivered_at;
    view.customer_confirmed_at = confirm.customer_confirmed_at;
    view.auto_confirm_at = confirm.auto_confirm_at;
    view.confirm_method = confirm.confirm_method;
  }

  if (!isFoodCustomerConfirmRequired()) {
    view.can_confirm = false;
    return view;
  }

  const confirmed = !!confirm?.customer_confirmed_at;
  const hasReview = !!view.review;
  const riderDelivered = !!confirm?.rider_delivered_at;

  view.can_confirm = riderDelivered && !confirmed;
  view.can_review = confirmed && !hasReview;

  if (riderDelivered && !confirmed) {
    view.phase = 'awaiting_customer_confirm';
    view.status_th = 'ยืนยันการรับอาหาร';
    view.status_detail = confirm?.auto_confirm_at
      ? 'กรุณายืนยันเมื่อได้รับอาหารครบ — หากไม่ยืนยัน ระบบจะยืนยันอัตโนมัติเมื่อครบเวลา'
      : 'กรุณากดยืนยันเมื่อได้รับอาหารครบถ้วน';
    view.delivered = true;
    view.can_review = false;
  } else if (confirmed && !hasReview) {
    view.phase = 'review_pending';
    view.status_th = 'ให้คะแนนและทิปไรเดอร์';
    view.status_detail = 'ให้คะแนนไรเดอร์และทิป (ถ้าต้องการ)';
    view.can_review = true;
    view.delivered = true;
  }

  return view;
}

export async function assertCustomerConfirmedForReview(orderId: string): Promise<boolean> {
  if (!isFoodCustomerConfirmRequired()) return true;
  const state = await getConfirmState(orderId);
  return !!state?.customer_confirmed_at;
}
