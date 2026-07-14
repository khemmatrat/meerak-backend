import fs from 'fs/promises';
import path from 'path';
import { bangkokMinutesOfDay, bangkokScheduleLabel } from '@/lib/server/thaiTime';
import { allowLocalDev } from '@/lib/server-env';
import { merchantOpsAvailable, merchantOpsFetch } from '@/lib/server/merchantOpsClient';
import type { UpstreamAuth } from '@/lib/server/upstreamAuth';

const OPS_FILE = path.join(process.cwd(), '.data', 'dev', 'merchant-shop-ops.json');

export type ShopOpsSettings = {
  auto_schedule: boolean;
  open_time: string;
  close_time: string;
  manual_closed: boolean;
  closed_note?: string;
  sold_out_item_ids: string[];
  busy_mode: boolean;
  busy_extra_minutes: number;
  busy_until?: string;
  auto_accept_orders: boolean;
};
export type ShopOpenState = {
  effective_open: boolean;
  reason: 'manual' | 'schedule' | 'open';
  label: string;
  ops: ShopOpsSettings;
};

type OpsStore = Record<string, ShopOpsSettings>;

export const DEFAULT_SHOP_OPS: ShopOpsSettings = {
  auto_schedule: true,
  open_time: '09:00',
  close_time: '21:00',
  manual_closed: false,
  closed_note: '',
  sold_out_item_ids: [],
  busy_mode: false,
  busy_extra_minutes: 0,
  auto_accept_orders: false,
};

function normalizeTime(raw: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw?.trim() || '');
  if (!m) return '09:00';
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function timeToMinutes(t: string): number {
  const [h, m] = normalizeTime(t).split(':').map(Number);
  return h * 60 + m;
}

export function isWithinShopHours(openTime: string, closeTime: string, now = new Date()): boolean {
  const cur = bangkokMinutesOfDay(now);
  const open = timeToMinutes(openTime);
  const close = timeToMinutes(closeTime);
  if (open === close) return true;
  if (open < close) return cur >= open && cur < close;
  return cur >= open || cur < close;
}

export function getBusyExtraPrepMinutes(ops: ShopOpsSettings, now = new Date()): number {
  if (!ops.busy_mode || !ops.busy_extra_minutes) return 0;
  if (ops.busy_until && new Date(ops.busy_until).getTime() < now.getTime()) return 0;
  return ops.busy_extra_minutes;
}

export async function setShopBusyMode(
  merchantId: string,
  extraMinutes: 0 | 15 | 30,
  auth?: UpstreamAuth,
): Promise<ShopOpenState & { busy_label?: string }> {
  const mins = extraMinutes;
  await persistOps(merchantId, { minutes: mins }, 'busy', auth);
  const state = await getShopOpenState(merchantId);
  const busy = getBusyExtraPrepMinutes(state.ops);
  return {
    ...state,
    busy_label: busy ? `โหมดคิวเยอะ +${busy} นาที` : undefined,
  };
}

export function computeShopOpenState(
  ops: ShopOpsSettings,
  now = new Date(),
): Omit<ShopOpenState, 'ops'> {
  if (ops.manual_closed) {
    return {
      effective_open: false,
      reason: 'manual',
      label: ops.closed_note?.trim() || 'ปิดฉุกเฉิน (ร้านปิดชั่วคราว)',
    };
  }
  if (ops.auto_schedule && !isWithinShopHours(ops.open_time, ops.close_time, now)) {
    return {
      effective_open: false,
      reason: 'schedule',
      label: `ปิดตามเวลา · เปิด ${ops.open_time}–${ops.close_time}`,
    };
  }
  if (ops.auto_schedule) {
    return {
      effective_open: true,
      reason: 'open',
      label: `${bangkokScheduleLabel(ops.open_time, ops.close_time)}${getBusyExtraPrepMinutes(ops) ? ` · คิวเยอะ +${getBusyExtraPrepMinutes(ops)} นาที` : ''}`,
    };
  }
  return { effective_open: true, reason: 'open', label: 'เปิดรับออเดอร์ (ไม่ใช้ตารางเวลา)' };
}

async function readStore(): Promise<OpsStore> {
  try {
    return JSON.parse(await fs.readFile(OPS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

async function writeStore(store: OpsStore) {
  await fs.mkdir(path.dirname(OPS_FILE), { recursive: true });
  await fs.writeFile(OPS_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function mergeOps(raw?: Partial<ShopOpsSettings>): ShopOpsSettings {
  return {
    ...DEFAULT_SHOP_OPS,
    ...raw,
    open_time: normalizeTime(raw?.open_time || DEFAULT_SHOP_OPS.open_time),
    close_time: normalizeTime(raw?.close_time || DEFAULT_SHOP_OPS.close_time),
    sold_out_item_ids: Array.isArray(raw?.sold_out_item_ids) ? [...raw!.sold_out_item_ids!] : [],
    busy_mode: !!raw?.busy_mode,
    busy_extra_minutes: Number(raw?.busy_extra_minutes) || 0,
    auto_accept_orders: !!raw?.auto_accept_orders,
  };
}

export async function getShopOps(merchantId: string): Promise<ShopOpsSettings> {
  if (merchantOpsAvailable()) {
    const remote = await merchantOpsFetch<{ ops: ShopOpsSettings }>(
      `/v1/merchant-ops/shop-ops?merchant_id=${encodeURIComponent(merchantId)}`,
    );
    if (remote?.ops) return mergeOps(remote.ops);
  }
  if (!allowLocalDev()) return mergeOps(undefined);
  const store = await readStore();
  return mergeOps(store[merchantId]);
}

export async function getShopOpenState(merchantId: string, now = new Date()): Promise<ShopOpenState> {
  const ops = await getShopOps(merchantId);
  return { ...computeShopOpenState(ops, now), ops };
}

async function persistOps(merchantId: string, patch: Record<string, unknown>, action?: string, auth?: UpstreamAuth) {
  if (merchantOpsAvailable()) {
    const remote = await merchantOpsFetch<{ ops: ShopOpsSettings }>('/v1/merchant-ops/shop-ops', {
      method: 'PATCH',
      body: JSON.stringify({ merchant_id: merchantId, action, ...patch }),
    }, auth);
    if (remote?.ops) return mergeOps(remote.ops);
  }
  if (!allowLocalDev()) return mergeOps(undefined);
  const store = await readStore();
  const cur = mergeOps(store[merchantId]);
  const next = mergeOps({ ...cur, ...patch } as Partial<ShopOpsSettings>);
  store[merchantId] = next;
  await writeStore(store);
  return next;
}

export async function updateShopOps(
  merchantId: string,
  patch: Partial<Omit<ShopOpsSettings, 'sold_out_item_ids'>>,
  auth?: UpstreamAuth,
): Promise<ShopOpenState> {
  await persistOps(merchantId, {
    auto_schedule: patch.auto_schedule,
    open_time: patch.open_time,
    close_time: patch.close_time,
    manual_closed: patch.manual_closed,
    closed_note: patch.closed_note,
    auto_accept_orders: patch.auto_accept_orders,
  }, undefined, auth);
  return getShopOpenState(merchantId);
}

export async function setManualShopClosed(
  merchantId: string,
  closed: boolean,
  note?: string,
  auth?: UpstreamAuth,
): Promise<ShopOpenState> {
  await persistOps(merchantId, {
    closed,
    note: note?.trim() || (closed ? 'วัตถุดิบไม่พร้อม / ของหมด' : ''),
  }, 'manual_close', auth);
  return getShopOpenState(merchantId);
}

export function isItemSoldOut(ops: ShopOpsSettings, itemId: string): boolean {
  return ops.sold_out_item_ids.includes(itemId);
}

export async function setItemSoldOut(
  merchantId: string,
  itemId: string,
  soldOut: boolean,
  auth?: UpstreamAuth,
): Promise<ShopOpsSettings> {
  await persistOps(merchantId, { item_id: itemId, sold_out: soldOut }, 'sold_out', auth);
  return getShopOps(merchantId);
}

export async function setBulkSoldOut(
  merchantId: string,
  itemIds: string[],
  soldOut: boolean,
  auth?: UpstreamAuth,
): Promise<ShopOpsSettings> {
  const ops = await getShopOps(merchantId);
  const set = new Set(ops.sold_out_item_ids);
  for (const id of itemIds) {
    if (soldOut) set.add(id);
    else set.delete(id);
  }
  for (const id of itemIds) {
    await persistOps(merchantId, { item_id: id, sold_out: soldOut }, 'sold_out', auth);
  }
  return getShopOps(merchantId);
}

export async function listSoldOutIds(merchantId: string): Promise<string[]> {
  const ops = await getShopOps(merchantId);
  return ops.sold_out_item_ids;
}
