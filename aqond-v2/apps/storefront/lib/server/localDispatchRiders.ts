import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const RIDERS_FILE = path.join(process.cwd(), '.data', 'dev', 'dispatch-riders.json');

export type LocalDispatchRider = {
  rider_id: string;
  user_id: string;
  display_name: string;
  phone: string;
  vehicle: string;
  plate: string;
  bank_account?: string;
  kyc_status: string;
  active: boolean;
  suspended: boolean;
  earnings_micro?: number;
  profile_photo_url?: string | null;
  created_at: string;
  updated_at: string;
};

type RiderStore = { riders: LocalDispatchRider[] };

async function readStore(): Promise<RiderStore> {
  try {
    return JSON.parse(await fs.readFile(RIDERS_FILE, 'utf8')) as RiderStore;
  } catch {
    return { riders: [] };
  }
}

async function writeStore(store: RiderStore) {
  await fs.mkdir(path.dirname(RIDERS_FILE), { recursive: true });
  await fs.writeFile(RIDERS_FILE, JSON.stringify(store, null, 2), 'utf8');
}

export async function localGetRiderByUserId(userId: string): Promise<LocalDispatchRider | null> {
  const store = await readStore();
  return store.riders.find((r) => r.user_id === userId) || null;
}

export async function localGetRiderByRiderId(riderId: string): Promise<LocalDispatchRider | null> {
  const store = await readStore();
  return store.riders.find((r) => r.rider_id === riderId) || null;
}

export async function localRegisterRider(
  userId: string,
  input: {
    display_name: string;
    phone: string;
    vehicle?: string;
    plate: string;
    bank_account?: string;
  },
): Promise<LocalDispatchRider> {
  const store = await readStore();
  const existing = store.riders.find((r) => r.user_id === userId);
  const now = new Date().toISOString();

  if (existing) {
    existing.display_name = input.display_name;
    existing.phone = input.phone;
    existing.vehicle = input.vehicle || existing.vehicle || 'motorcycle';
    existing.plate = input.plate;
    existing.bank_account = input.bank_account || existing.bank_account;
    existing.kyc_status = 'approved';
    existing.active = true;
    existing.suspended = false;
    existing.updated_at = now;
    await writeStore(store);
    return existing;
  }

  const rider: LocalDispatchRider = {
    rider_id: `rider-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
    user_id: userId,
    display_name: input.display_name,
    phone: input.phone,
    vehicle: input.vehicle || 'motorcycle',
    plate: input.plate,
    bank_account: input.bank_account,
    kyc_status: 'approved',
    active: true,
    suspended: false,
    earnings_micro: 0,
    created_at: now,
    updated_at: now,
  };
  store.riders.unshift(rider);
  await writeStore(store);
  return rider;
}

export async function localSetRiderPortrait(riderId: string, url: string) {
  const store = await readStore();
  const r = store.riders.find((x) => x.rider_id === riderId);
  if (!r) return false;
  r.profile_photo_url = url;
  r.updated_at = new Date().toISOString();
  await writeStore(store);
  return true;
}

export function localRiderToProfile(r: LocalDispatchRider) {
  return {
    rider_id: r.rider_id,
    user_id: r.user_id,
    display_name: r.display_name,
    phone: r.phone,
    vehicle: r.vehicle,
    plate: r.plate,
    kyc_status: r.kyc_status,
    active: r.active,
    suspended: r.suspended,
    earnings_micro: r.earnings_micro ?? 0,
    profile_photo_url: r.profile_photo_url || null,
    source: 'local-dispatch',
  };
}
