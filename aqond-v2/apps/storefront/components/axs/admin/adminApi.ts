export const ADMIN_KEY_STORAGE = 'aqond_admin_key';

export async function adminPost(path: string, key: string, body?: object) {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': key },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'admin error');
  return data;
}

export async function adminGet(path: string, key: string) {
  const res = await fetch(path, {
    headers: { 'x-admin-key': key },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'admin error');
  return data;
}

export function adminFoodStatusTone(status: string): 'pending' | 'active' | 'delivering' | 'completed' | 'cancelled' | 'default' {
  switch (status) {
    case 'waiting_rider':
    case 'pending_accept':
      return 'pending';
    case 'cooking':
    case 'preparing':
    case 'accepted':
      return 'active';
    case 'ready':
    case 'delivering':
      return 'delivering';
    case 'delivered':
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'default';
  }
}
