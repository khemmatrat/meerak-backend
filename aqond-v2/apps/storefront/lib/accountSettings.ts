export type AccountSettingsProfile = {
  user_id: string;
  username: string;
  username_changed_at?: string;
  username_can_change?: boolean;
  display_name: string;
  bio: string;
  gender: string;
  birthday: string;
  email: string;
  phone: string;
  phone_masked?: string;
  email_masked?: string;
  avatar_url: string;
  quick_login_enabled: boolean;
  quick_login_provider: string;
  passkey_configured: boolean;
  social_apple: boolean;
  social_line: boolean;
  social_google: boolean;
};

export type AccountSettingsData = {
  profile: AccountSettingsProfile;
  bank_accounts: Array<{
    id: string;
    bank_code: string;
    bank_name: string;
    account_suffix: string;
    verified: boolean;
    is_default: boolean;
  }>;
  cards: Array<{ id: string; brand: string; last4: string; expiry?: string }>;
  point_cards: Array<{ id: string; brand: string; last4: string; expiry?: string }>;
  auto_pay_enabled: boolean;
  device_alert: boolean;
};

export async function fetchAccountSettings(
  userId: string,
  seed?: { phone?: string; email?: string; name?: string },
): Promise<AccountSettingsData> {
  const q = new URLSearchParams({ user_id: userId });
  if (seed?.phone) q.set('phone', seed.phone);
  if (seed?.email) q.set('email', seed.email);
  if (seed?.name) q.set('name', seed.name);
  const res = await fetch(`/api/account/settings?${q}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('load_failed');
  return res.json();
}

export async function saveAccountSettings(
  userId: string,
  patch: Record<string, unknown>,
): Promise<AccountSettingsData> {
  const res = await fetch('/api/account/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, ...patch }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'save_failed');
  return data;
}

export function formatBirthday(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function profileFieldLabel(value: string, empty = 'ตั้งค่า'): string {
  return value?.trim() ? value : empty;
}
