import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

const ADDR_FILE = path.join(process.cwd(), '.data', 'dev', 'addresses.json');

export type LocalAddress = {
  id: string;
  owner_id: string;
  recipient: string;
  phone: string;
  line1: string;
  city?: string;
  district?: string;
  province?: string;
  postal_code: string;
  country: string;
  label?: string;
  is_default?: boolean;
  created_at: string;
};

type AddressStore = Record<string, LocalAddress[]>;

async function readStore(): Promise<AddressStore> {
  try {
    return JSON.parse(await fs.readFile(ADDR_FILE, 'utf8'));
  } catch {
    return {};
  }
}

async function writeStore(store: AddressStore) {
  await fs.mkdir(path.dirname(ADDR_FILE), { recursive: true });
  await fs.writeFile(ADDR_FILE, JSON.stringify(store, null, 2), 'utf8');
}

export async function listLocalAddresses(ownerId: string): Promise<LocalAddress[]> {
  const store = await readStore();
  return store[ownerId] || [];
}

export type AddLocalAddressInput = {
  recipient: string;
  phone: string;
  line1: string;
  city?: string;
  postal_code: string;
  country?: string;
  label?: string;
  is_default?: boolean;
};

export async function addLocalAddress(ownerId: string, input: AddLocalAddressInput) {
  const store = await readStore();
  const list = store[ownerId] || [];
  const addr: LocalAddress = {
    id: `addr-${randomUUID().slice(0, 8)}`,
    owner_id: ownerId,
    recipient: input.recipient,
    phone: input.phone,
    line1: input.line1,
    city: input.city || 'กรุงเทพมหานคร',
    postal_code: input.postal_code,
    country: input.country || 'TH',
    label: input.label || 'บ้าน',
    is_default: input.is_default ?? list.length === 0,
    created_at: new Date().toISOString(),
  };
  if (addr.is_default) {
    for (const a of list) a.is_default = false;
  }
  list.unshift(addr);
  store[ownerId] = list;
  await writeStore(store);
  return addr;
}
