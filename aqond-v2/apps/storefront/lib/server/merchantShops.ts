import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { allowLocalDev } from '@/lib/server-env';
import { merchantOpsAvailable, merchantOpsFetch } from '@/lib/server/merchantOpsClient';
import type { UpstreamAuth } from '@/lib/server/upstreamAuth';

const SHOPS_FILE = path.join(process.cwd(), '.data', 'dev', 'merchant-shops.json');

export const FREE_SHOP_SLOTS = 5;
export const MAX_SHOP_SLOTS = 30;
export const SLOT_PRICE_MICRO = 69_900;
export const SLOT_PRICE_BAHT = 699;

export type ShopStatus = 'pending' | 'approved' | 'rejected';
export type ShopType = 'food' | 'marketplace';

export type MerchantShop = {
  id: string;
  owner_id: string;
  name: string;
  type: ShopType;
  status: ShopStatus;
  created_at: string;
  approved_at?: string;
  rejected_reason?: string;
};

export type MerchantOwnerProfile = {
  owner_id: string;
  extra_slots: number;
  shops: MerchantShop[];
};

type Store = Record<string, MerchantOwnerProfile>;

const SYSTEM_SHOPS: MerchantShop[] = [
  { id: 'demo-merchant', owner_id: '*', name: 'ร้านค้า Demo', type: 'marketplace', status: 'approved', created_at: '2026-01-01T00:00:00Z', approved_at: '2026-01-01T00:00:00Z' },
  { id: 'food-thai-1', owner_id: '*', name: 'ครัวบ้านสวน', type: 'food', status: 'approved', created_at: '2026-01-01T00:00:00Z', approved_at: '2026-01-01T00:00:00Z' },
  { id: 'food-jp-1', owner_id: '*', name: 'ซูชิโฮมุระ', type: 'food', status: 'approved', created_at: '2026-01-01T00:00:00Z', approved_at: '2026-01-01T00:00:00Z' },
  { id: 'food-cafe-1', owner_id: '*', name: 'Matcha House', type: 'food', status: 'approved', created_at: '2026-01-01T00:00:00Z', approved_at: '2026-01-01T00:00:00Z' },
  { id: 'm-fashion-1', owner_id: '*', name: 'Fashion Corner', type: 'marketplace', status: 'approved', created_at: '2026-01-01T00:00:00Z', approved_at: '2026-01-01T00:00:00Z' },
];

function useJsonFallback(): boolean {
  return allowLocalDev() && !merchantOpsAvailable();
}

async function readStore(): Promise<Store> {
  try {
    return JSON.parse(await fs.readFile(SHOPS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

async function writeStore(store: Store) {
  await fs.mkdir(path.dirname(SHOPS_FILE), { recursive: true });
  await fs.writeFile(SHOPS_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function emptyProfile(ownerId: string): MerchantOwnerProfile {
  return { owner_id: ownerId, extra_slots: 0, shops: [] };
}

function mapShopFromPg(raw: Record<string, unknown>): MerchantShop {
  return {
    id: String(raw.id),
    owner_id: String(raw.owner_id),
    name: String(raw.name),
    type: (raw.type === 'food' ? 'food' : 'marketplace') as ShopType,
    status: (raw.status as ShopStatus) || 'pending',
    created_at: String(raw.created_at || new Date().toISOString()),
    approved_at: raw.approved_at ? String(raw.approved_at) : undefined,
    rejected_reason: raw.rejected_reason ? String(raw.rejected_reason) : undefined,
  };
}

export function maxAllowedShops(profile: MerchantOwnerProfile): number {
  return Math.min(MAX_SHOP_SLOTS, FREE_SHOP_SLOTS + profile.extra_slots);
}

export function slotUsage(profile: MerchantOwnerProfile) {
  const owned = profile.shops.filter((s) => s.owner_id !== '*');
  const used = owned.filter((s) => s.status !== 'rejected').length;
  const approved = owned.filter((s) => s.status === 'approved').length;
  const pending = owned.filter((s) => s.status === 'pending').length;
  const max = maxAllowedShops(profile);
  return { used, approved, pending, max, free_base: FREE_SHOP_SLOTS, extra_slots: profile.extra_slots };
}

export async function getOwnerProfile(ownerId: string): Promise<MerchantOwnerProfile> {
  if (merchantOpsAvailable()) {
    const data = await merchantOpsFetch<{
      profile: { extra_slots?: number };
      shops: Array<Record<string, unknown>>;
    }>(`/v1/merchant-ops/shops?owner_id=${encodeURIComponent(ownerId)}`);
    if (data?.shops) {
      const owned = data.shops
        .filter((s) => String(s.owner_id) === ownerId)
        .map(mapShopFromPg);
      return {
        owner_id: ownerId,
        extra_slots: data.profile?.extra_slots || 0,
        shops: owned,
      };
    }
  }
  if (!useJsonFallback()) {
    return emptyProfile(ownerId);
  }
  const store = await readStore();
  return store[ownerId] || emptyProfile(ownerId);
}

export function listAccessibleShops(profile: MerchantOwnerProfile): MerchantShop[] {
  const owned = profile.shops.filter((s) => s.status === 'approved');
  if (!allowLocalDev()) {
    return owned;
  }
  const system = SYSTEM_SHOPS.filter((s) => s.status === 'approved');
  const seen = new Set(owned.map((s) => s.id));
  return [...owned, ...system.filter((s) => !seen.has(s.id))];
}

export async function createShopRequest(
  ownerId: string,
  input: { name: string; type: ShopType },
): Promise<{ shop: MerchantShop; profile: MerchantOwnerProfile; error?: string }> {
  if (merchantOpsAvailable()) {
    const data = await merchantOpsFetch<{ shop: Record<string, unknown>; error?: string }>(
      '/v1/merchant-ops/shops',
      {
        method: 'POST',
        body: JSON.stringify({ owner_id: ownerId, name: input.name, type: input.type }),
      },
      { userId: ownerId },
    );
    if (data?.shop) {
      const profile = await getOwnerProfile(ownerId);
      return { shop: mapShopFromPg(data.shop), profile };
    }
    if (!useJsonFallback()) {
      return { shop: {} as MerchantShop, profile: await getOwnerProfile(ownerId), error: 'create_failed' };
    }
  }
  const store = await readStore();
  const profile = store[ownerId] || emptyProfile(ownerId);
  const usage = slotUsage(profile);
  if (usage.used >= usage.max) {
    return {
      shop: {} as MerchantShop,
      profile,
      error: usage.max >= MAX_SHOP_SLOTS
        ? `ถึงขีดจำกัด ${MAX_SHOP_SLOTS} ร้านแล้ว`
        : `เต็มสล็อตแล้ว (${usage.used}/${usage.max}) — ซื้อสล็อตเพิ่ม ฿${SLOT_PRICE_BAHT}`,
    };
  }
  const shop: MerchantShop = {
    id: `shop-${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`,
    owner_id: ownerId,
    name: input.name.trim(),
    type: input.type,
    status: 'pending',
    created_at: new Date().toISOString(),
  };
  profile.shops.unshift(shop);
  store[ownerId] = profile;
  await writeStore(store);
  return { shop, profile };
}

export async function purchaseShopSlot(ownerId: string): Promise<{
  profile: MerchantOwnerProfile;
  error?: string;
}> {
  if (merchantOpsAvailable()) {
    const data = await merchantOpsFetch<{ ok?: boolean }>('/v1/merchant-ops/shops', {
      method: 'PATCH',
      body: JSON.stringify({ action: 'purchase_slot', owner_id: ownerId }),
    }, { userId: ownerId });
    if (data?.ok) {
      return { profile: await getOwnerProfile(ownerId) };
    }
    if (!useJsonFallback()) {
      return { profile: await getOwnerProfile(ownerId), error: 'purchase_failed' };
    }
  }
  const store = await readStore();
  const profile = store[ownerId] || emptyProfile(ownerId);
  if (maxAllowedShops(profile) >= MAX_SHOP_SLOTS) {
    return { profile, error: `สูงสุด ${MAX_SHOP_SLOTS} ร้าน` };
  }
  profile.extra_slots += 1;
  store[ownerId] = profile;
  await writeStore(store);
  return { profile };
}

export async function approveShop(shopId: string, ownerId?: string, auth?: UpstreamAuth): Promise<MerchantShop | null> {
  if (merchantOpsAvailable()) {
    const data = await merchantOpsFetch<{ shop: Record<string, unknown> }>('/v1/merchant-ops/shops', {
      method: 'PATCH',
      body: JSON.stringify({ action: 'approve', shop_id: shopId, owner_id: ownerId }),
    }, { userId: auth?.userId || ownerId || 'admin', authorization: auth?.authorization, sessionId: auth?.sessionId });
    if (data?.shop) return mapShopFromPg(data.shop);
    if (!useJsonFallback()) return null;
  }
  const store = await readStore();
  for (const [oid, profile] of Object.entries(store)) {
    if (ownerId && oid !== ownerId) continue;
    const hit = profile.shops.find((s) => s.id === shopId && s.status === 'pending');
    if (hit) {
      hit.status = 'approved';
      hit.approved_at = new Date().toISOString();
      await writeStore(store);
      return hit;
    }
  }
  return null;
}

export async function rejectShop(shopId: string, reason?: string, auth?: UpstreamAuth): Promise<boolean> {
  if (merchantOpsAvailable()) {
    const data = await merchantOpsFetch<{ ok?: boolean }>('/v1/merchant-ops/shops', {
      method: 'PATCH',
      body: JSON.stringify({ action: 'reject', shop_id: shopId, reason }),
    }, { userId: auth?.userId || 'admin', authorization: auth?.authorization, sessionId: auth?.sessionId });
    if (data?.ok) return true;
    if (!useJsonFallback()) return false;
  }
  const store = await readStore();
  for (const profile of Object.values(store)) {
    const hit = profile.shops.find((s) => s.id === shopId && s.status === 'pending');
    if (hit) {
      hit.status = 'rejected';
      hit.rejected_reason = reason || 'ไม่ผ่านการตรวจสอบ';
      await writeStore(store);
      return true;
    }
  }
  return false;
}

export async function getOwnerDashboard(ownerId: string) {
  const profile = await getOwnerProfile(ownerId);
  let accessible = listAccessibleShops(profile);
  if (merchantOpsAvailable()) {
    const data = await merchantOpsFetch<{ shops: Array<Record<string, unknown>> }>(
      `/v1/merchant-ops/shops?owner_id=${encodeURIComponent(ownerId)}`,
    );
    if (data?.shops) {
      accessible = data.shops
        .filter((s) => s.status === 'approved')
        .map(mapShopFromPg);
      if (allowLocalDev()) {
        const seen = new Set(accessible.map((s) => s.id));
        for (const s of SYSTEM_SHOPS) {
          if (!seen.has(s.id)) accessible.push(s);
        }
      }
    }
  }
  return {
    owner_id: ownerId,
    profile,
    usage: slotUsage(profile),
    accessible_shops: accessible,
    pending_shops: profile.shops.filter((s) => s.status === 'pending'),
    slot_price_micro: SLOT_PRICE_MICRO,
    slot_price_baht: SLOT_PRICE_BAHT,
    free_slots: FREE_SHOP_SLOTS,
    max_slots: MAX_SHOP_SLOTS,
  };
}

export function shopMeta(shopId: string, accessible: MerchantShop[]) {
  const hit = accessible.find((s) => s.id === shopId) || SYSTEM_SHOPS.find((s) => s.id === shopId);
  return {
    id: shopId,
    name: hit?.name || shopId,
    type: hit?.type || (shopId.startsWith('food-') ? 'food' : 'marketplace'),
    is_food: hit?.type === 'food' || shopId.startsWith('food-'),
  };
}

export async function resolveShopStartDate(merchantId: string): Promise<string> {
  if (merchantOpsAvailable()) {
    const data = await merchantOpsFetch<{ shops: Array<Record<string, unknown>> }>(
      `/v1/merchant-ops/shops?owner_id=${encodeURIComponent('system')}`,
    );
    const hit = data?.shops?.find((s) => s.id === merchantId);
    if (hit) {
      return String(hit.approved_at || hit.created_at || '2026-01-01T00:00:00Z');
    }
  }
  const store = await readStore();
  for (const profile of Object.values(store)) {
    const hit = profile.shops.find((s) => s.id === merchantId && s.status === 'approved');
    if (hit) return hit.approved_at || hit.created_at;
  }
  const sys = SYSTEM_SHOPS.find((s) => s.id === merchantId);
  if (sys) return sys.approved_at || sys.created_at;
  return '2026-01-01T00:00:00Z';
}
