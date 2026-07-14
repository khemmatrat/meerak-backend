import { merchantOpsAvailable, merchantOpsFetch } from '@/lib/server/merchantOpsClient';
import type { UpstreamAuth } from '@/lib/server/upstreamAuth';
import { allowLocalDev } from '@/lib/server-env';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const STAFF_FILE = path.join(process.cwd(), '.data', 'dev', 'merchant-staff.json');

export type StaffRole = 'owner' | 'staff' | 'none';

export type StaffMember = {
  id: string;
  owner_id: string;
  user_id: string;
  display_name: string;
  role: StaffRole;
  shop_ids: string[];
  created_at: string;
};

export type StaffPermissions = {
  role: StaffRole;
  can_accept_orders: boolean;
  can_edit_menu: boolean;
  can_withdraw_wallet: boolean;
  can_manage_staff: boolean;
  can_manage_shop_settings: boolean;
};

type Store = { members: StaffMember[] };

function mapPerms(raw: Record<string, unknown>): StaffPermissions {
  return {
    role: (raw.role as StaffRole) || 'none',
    can_accept_orders: !!raw.can_accept_orders,
    can_edit_menu: !!raw.can_edit_menu,
    can_withdraw_wallet: !!raw.can_withdraw_wallet,
    can_manage_staff: !!raw.can_manage_staff,
    can_manage_shop_settings: !!raw.can_manage_shop_settings,
  };
}

async function readStore(): Promise<Store> {
  try {
    return JSON.parse(await fs.readFile(STAFF_FILE, 'utf8'));
  } catch {
    return { members: [] };
  }
}

async function writeStore(store: Store) {
  await fs.mkdir(path.dirname(STAFF_FILE), { recursive: true });
  await fs.writeFile(STAFF_FILE, JSON.stringify(store, null, 2), 'utf8');
}

export function permissionsForRole(role: StaffRole): StaffPermissions {
  if (role === 'owner') {
    return {
      role: 'owner',
      can_accept_orders: true,
      can_edit_menu: true,
      can_withdraw_wallet: true,
      can_manage_staff: true,
      can_manage_shop_settings: true,
    };
  }
  if (role === 'staff') {
    return {
      role: 'staff',
      can_accept_orders: true,
      can_edit_menu: false,
      can_withdraw_wallet: false,
      can_manage_staff: false,
      can_manage_shop_settings: false,
    };
  }
  return {
    role: 'none',
    can_accept_orders: false,
    can_edit_menu: false,
    can_withdraw_wallet: false,
    can_manage_staff: false,
    can_manage_shop_settings: false,
  };
}

export async function resolveStaffAccess(
  userId: string,
  merchantId: string,
  ownerId?: string,
): Promise<StaffPermissions> {
  if (merchantOpsAvailable()) {
    const q = new URLSearchParams({ user_id: userId, merchant_id: merchantId });
    if (ownerId) q.set('owner_id', ownerId);
    const data = await merchantOpsFetch<{ permissions: Record<string, unknown> }>(
      `/v1/merchant-ops/staff?${q}`,
    );
    if (data?.permissions) return mapPerms(data.permissions);
  }
  const store = await readStore();
  if (ownerId && userId === ownerId) return permissionsForRole('owner');
  const hit = store.members.find(
    (m) =>
      m.user_id === userId &&
      m.role === 'staff' &&
      (m.shop_ids.includes(merchantId) || m.shop_ids.includes('*')),
  );
  if (hit) return permissionsForRole('staff');
  if (allowLocalDev() && (userId === ownerId || userId === 'guest')) {
    return permissionsForRole('owner');
  }
  return permissionsForRole('none');
}

export async function listStaffForOwner(ownerId: string): Promise<StaffMember[]> {
  if (merchantOpsAvailable()) {
    const data = await merchantOpsFetch<{ members: StaffMember[] }>(
      `/v1/merchant-ops/staff?owner_id=${encodeURIComponent(ownerId)}`,
    );
    if (data?.members) return data.members;
  }
  const store = await readStore();
  return store.members.filter((m) => m.owner_id === ownerId);
}

export async function listStaffShopsForUser(userId: string): Promise<{
  shops: { id: string; name: string; type: string; owner_id: string }[];
  role: StaffRole;
}> {
  if (merchantOpsAvailable()) {
    const data = await merchantOpsFetch<{
      shops: { id: string; name: string; type: string; owner_id: string }[];
      role: StaffRole;
    }>(`/v1/merchant-ops/staff/shops?user_id=${encodeURIComponent(userId)}`);
    if (data?.shops) return { shops: data.shops, role: data.role || 'owner' };
  }
  return { shops: [], role: 'owner' };
}

export async function addStaffMember(input: {
  owner_id: string;
  user_id: string;
  display_name: string;
  shop_ids?: string[];
}, auth?: UpstreamAuth): Promise<StaffMember> {
  const shopIds = input.shop_ids?.length ? input.shop_ids : ['*'];
  if (merchantOpsAvailable()) {
    const ok = await merchantOpsFetch<{ ok: boolean }>('/v1/merchant-ops/staff', {
      method: 'POST',
      body: JSON.stringify({
        owner_id: input.owner_id,
        user_id: input.user_id.trim(),
        display_name: input.display_name.trim(),
        role: 'staff',
        shop_ids: shopIds,
      }),
    }, { userId: auth?.userId || input.owner_id, authorization: auth?.authorization, sessionId: auth?.sessionId });
    if (ok?.ok) {
      const members = await listStaffForOwner(input.owner_id);
      const hit = members.find((m) => m.user_id === input.user_id.trim());
      if (hit) return hit;
    }
  }
  const store = await readStore();
  const member: StaffMember = {
    id: `stf-${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`,
    owner_id: input.owner_id,
    user_id: input.user_id.trim(),
    display_name: input.display_name.trim(),
    role: 'staff',
    shop_ids: shopIds,
    created_at: new Date().toISOString(),
  };
  store.members = store.members.filter(
    (m) => !(m.owner_id === input.owner_id && m.user_id === member.user_id),
  );
  store.members.unshift(member);
  await writeStore(store);
  return member;
}

export async function removeStaffMember(ownerId: string, staffId: string, auth?: UpstreamAuth): Promise<boolean> {
  if (merchantOpsAvailable()) {
    const res = await merchantOpsFetch<{ ok: boolean }>(
      `/v1/merchant-ops/staff?id=${encodeURIComponent(staffId)}&owner_id=${encodeURIComponent(ownerId)}`,
      { method: 'DELETE' },
      { userId: auth?.userId || ownerId, authorization: auth?.authorization, sessionId: auth?.sessionId },
    );
    if (res?.ok) return true;
  }
  const store = await readStore();
  const before = store.members.length;
  store.members = store.members.filter((m) => !(m.id === staffId && m.owner_id === ownerId));
  if (store.members.length === before) return false;
  await writeStore(store);
  return true;
}

export function assertPermission(perms: StaffPermissions, need: keyof StaffPermissions) {
  if (!perms[need]) {
    throw new Error('ไม่มีสิทธิ์ทำรายการนี้ (บัญชีพนักงาน)');
  }
}
