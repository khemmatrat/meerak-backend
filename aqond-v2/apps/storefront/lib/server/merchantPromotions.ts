import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { bangkokMinutesOfDay } from '@/lib/server/thaiTime';
import { merchantOpsAvailable, merchantOpsFetch } from '@/lib/server/merchantOpsClient';
import type { UpstreamAuth } from '@/lib/server/upstreamAuth';
import { allowLocalDev } from '@/lib/server-env';

const PROMO_FILE = path.join(process.cwd(), '.data', 'dev', 'merchant-promotions.json');

export type PromoKind = 'menu_discount' | 'free_delivery' | 'temp_min_order';

export type MerchantPromotion = {
  id: string;
  merchant_id: string;
  kind: PromoKind;
  label: string;
  active: boolean;
  item_ids?: string[];
  discount_percent?: number;
  window_start?: string;
  window_end?: string;
  min_order_micro?: number;
  ends_at?: string;
  created_at: string;
};

type Store = Record<string, MerchantPromotion[]>;

async function readStore(): Promise<Store> {
  try {
    return JSON.parse(await fs.readFile(PROMO_FILE, 'utf8'));
  } catch {
    return {};
  }
}

async function writeStore(store: Store) {
  await fs.mkdir(path.dirname(PROMO_FILE), { recursive: true });
  await fs.writeFile(PROMO_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function parseHm(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function inTimeWindow(start: string, end: string, now = new Date()): boolean {
  const cur = bangkokMinutesOfDay(now);
  const a = parseHm(start);
  const b = parseHm(end);
  if (a <= b) return cur >= a && cur < b;
  return cur >= a || cur < b;
}

export async function listMerchantPromotions(merchantId: string): Promise<MerchantPromotion[]> {
  if (merchantOpsAvailable()) {
    const remote = await merchantOpsFetch<{ promotions: MerchantPromotion[] }>(
      `/v1/merchant-ops/promotions?merchant_id=${encodeURIComponent(merchantId)}`,
    );
    if (remote?.promotions) return remote.promotions;
  }
  if (!allowLocalDev()) return [];
  const store = await readStore();
  return store[merchantId] || [];
}

export async function upsertMerchantPromotion(
  merchantId: string,
  input: Omit<MerchantPromotion, 'id' | 'merchant_id' | 'created_at'> & { id?: string },
  auth?: UpstreamAuth,
): Promise<MerchantPromotion> {
  if (merchantOpsAvailable()) {
    await merchantOpsFetch('/v1/merchant-ops/promotions', {
      method: 'POST',
      body: JSON.stringify({ merchant_id: merchantId, ...input, item_ids: input.item_ids || [] }),
    }, auth);
    const list = await listMerchantPromotions(merchantId);
    const hit = list.find((p) => p.id === input.id) || list[0];
    if (hit) return hit;
  }
  if (!allowLocalDev()) {
    throw new Error('merchant_ops_unavailable');
  }
  const store = await readStore();
  const list = store[merchantId] || [];
  const promo: MerchantPromotion = {
    id: input.id || `promo-${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`,
    merchant_id: merchantId,
    kind: input.kind,
    label: input.label.trim(),
    active: input.active,
    item_ids: input.item_ids,
    discount_percent: input.discount_percent,
    window_start: input.window_start,
    window_end: input.window_end,
    min_order_micro: input.min_order_micro,
    ends_at: input.ends_at,
    created_at: list.find((p) => p.id === input.id)?.created_at || new Date().toISOString(),
  };
  const idx = list.findIndex((p) => p.id === promo.id);
  if (idx >= 0) list[idx] = promo;
  else list.unshift(promo);
  store[merchantId] = list;
  await writeStore(store);
  return promo;
}

export async function deleteMerchantPromotion(merchantId: string, promoId: string, auth?: UpstreamAuth): Promise<boolean> {
  if (merchantOpsAvailable()) {
    const res = await merchantOpsFetch<{ deleted: boolean }>(
      `/v1/merchant-ops/promotions?id=${encodeURIComponent(promoId)}`,
      { method: 'DELETE' },
      auth,
    );
    if (res?.deleted) return true;
  }
  if (!allowLocalDev()) return false;
  const store = await readStore();
  const list = store[merchantId] || [];
  const next = list.filter((p) => p.id !== promoId);
  if (next.length === list.length) return false;
  store[merchantId] = next;
  await writeStore(store);
  return true;
}

export function activePromotionsForShop(promos: MerchantPromotion[], now = new Date()) {
  return promos.filter((p) => {
    if (!p.active) return false;
    if (p.ends_at && new Date(p.ends_at).getTime() < now.getTime()) return false;
    if (p.kind === 'free_delivery' && p.window_start && p.window_end) {
      return inTimeWindow(p.window_start, p.window_end, now);
    }
    return true;
  });
}

export function menuDiscountPercent(promos: MerchantPromotion[], itemId: string): number {
  let best = 0;
  for (const p of activePromotionsForShop(promos)) {
    if (p.kind !== 'menu_discount' || !p.discount_percent) continue;
    if (p.item_ids?.length && !p.item_ids.includes(itemId)) continue;
    best = Math.max(best, p.discount_percent);
  }
  return best;
}

export function effectiveMinOrderFromPromos(
  baseMin: number,
  promos: MerchantPromotion[],
  now = new Date(),
): number {
  let min = baseMin;
  for (const p of activePromotionsForShop(promos, now)) {
    if (p.kind === 'temp_min_order' && p.min_order_micro != null) {
      min = Math.min(min, p.min_order_micro);
    }
  }
  return min;
}

export function hasFreeDeliveryPromo(promos: MerchantPromotion[], now = new Date()): boolean {
  return activePromotionsForShop(promos, now).some((p) => p.kind === 'free_delivery');
}
