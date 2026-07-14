import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const FILE = path.join(process.cwd(), '.data', 'dev', 'user-account-settings.json');

export type UserAccountProfile = {
  user_id: string;
  username: string;
  username_changed_at?: string;
  display_name: string;
  bio: string;
  gender: string;
  birthday: string;
  email: string;
  phone: string;
  avatar_url: string;
  quick_login_enabled: boolean;
  quick_login_provider: string;
  passkey_configured: boolean;
  social_apple: boolean;
  social_line: boolean;
  social_google: boolean;
  updated_at: string;
};

export type UserBankAccount = {
  id: string;
  bank_code: string;
  bank_name: string;
  account_suffix: string;
  verified: boolean;
  is_default: boolean;
};

export type UserPaymentCard = {
  id: string;
  brand: string;
  last4: string;
  expiry?: string;
};

export type UserAccountData = {
  profile: UserAccountProfile;
  bank_accounts: UserBankAccount[];
  cards: UserPaymentCard[];
  point_cards: UserPaymentCard[];
  auto_pay_enabled: boolean;
  device_alert: boolean;
};

type Store = Record<string, UserAccountData>;

function defaultData(
  userId: string,
  seed?: Partial<UserAccountProfile> & { name?: string },
): UserAccountData {
  const phone = seed?.phone || '';
  const slug = phone.replace(/\D/g, '').slice(-8) || userId.replace(/-/g, '').slice(0, 12);
  return {
    profile: {
      user_id: userId,
      username: seed?.username || slug,
      display_name: seed?.display_name || seed?.name || '',
      bio: seed?.bio || '',
      gender: seed?.gender || '',
      birthday: seed?.birthday || '',
      email: seed?.email || '',
      phone,
      avatar_url: seed?.avatar_url || '',
      quick_login_enabled: seed?.quick_login_enabled ?? false,
      quick_login_provider: seed?.quick_login_provider || 'Apple',
      passkey_configured: seed?.passkey_configured ?? false,
      social_apple: seed?.social_apple ?? false,
      social_line: seed?.social_line ?? false,
      social_google: seed?.social_google ?? false,
      updated_at: new Date().toISOString(),
    },
    bank_accounts: [],
    cards: [],
    point_cards: [],
    auto_pay_enabled: false,
    device_alert: true,
  };
}

async function readStore(): Promise<Store> {
  try {
    return JSON.parse(await fs.readFile(FILE, 'utf8')) as Store;
  } catch {
    return {};
  }
}

async function writeStore(store: Store) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(store, null, 2), 'utf8');
}

export async function getUserAccountData(
  userId: string,
  seed?: Partial<UserAccountProfile> & { name?: string },
): Promise<UserAccountData> {
  const store = await readStore();
  if (!store[userId]) {
    store[userId] = defaultData(userId, seed);
    await writeStore(store);
  }
  const data = store[userId];
  if (seed) {
    const p = data.profile;
    if (seed.phone && !p.phone) p.phone = seed.phone;
    if (seed.email && !p.email) p.email = seed.email;
    if (seed.display_name && !p.display_name) p.display_name = seed.display_name;
    if (seed.avatar_url && !p.avatar_url) p.avatar_url = seed.avatar_url;
    p.updated_at = new Date().toISOString();
    await writeStore(store);
  }
  return data;
}

export async function patchUserAccountData(
  userId: string,
  patch: {
    profile?: Partial<UserAccountProfile>;
    bank_accounts?: UserBankAccount[];
    cards?: UserPaymentCard[];
    point_cards?: UserPaymentCard[];
    auto_pay_enabled?: boolean;
    device_alert?: boolean;
    add_bank?: Omit<UserBankAccount, 'id'>;
    add_card?: Omit<UserPaymentCard, 'id'>;
  },
): Promise<UserAccountData> {
  const store = await readStore();
  const data = store[userId] || defaultData(userId);
  if (patch.profile) {
    const incoming = patch.profile;
    if (incoming.username !== undefined && incoming.username !== data.profile.username) {
      if (data.profile.username_changed_at) {
        throw new Error('username_change_limit');
      }
      data.profile.username = incoming.username;
      data.profile.username_changed_at = new Date().toISOString();
    }
    const skip = new Set(['username', 'username_changed_at', 'user_id']);
    for (const [key, val] of Object.entries(incoming)) {
      if (skip.has(key) || val === undefined) continue;
      (data.profile as Record<string, unknown>)[key] = val;
    }
    data.profile.updated_at = new Date().toISOString();
  }
  if (patch.bank_accounts) data.bank_accounts = patch.bank_accounts;
  if (patch.cards) data.cards = patch.cards;
  if (patch.point_cards) data.point_cards = patch.point_cards;
  if (patch.auto_pay_enabled !== undefined) data.auto_pay_enabled = patch.auto_pay_enabled;
  if (patch.device_alert !== undefined) data.device_alert = patch.device_alert;
  if (patch.add_bank) {
    const row: UserBankAccount = { id: crypto.randomUUID(), ...patch.add_bank };
    if (row.is_default) {
      data.bank_accounts.forEach((b) => {
        b.is_default = false;
      });
    }
    data.bank_accounts.push(row);
  }
  if (patch.add_card) {
    data.cards.push({ id: crypto.randomUUID(), ...patch.add_card });
  }
  store[userId] = data;
  await writeStore(store);
  return data;
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 2) return '*****';
  return `*****${digits.slice(-2)}`;
}

export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '';
  const [local, domain] = email.split('@');
  if (local.length <= 1) return `*@${domain}`;
  return `${local[0]}${'*'.repeat(Math.max(1, local.length - 2))}${local.slice(-1)}@${domain}`;
}
