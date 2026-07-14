import { NextRequest, NextResponse } from 'next/server';
import { allowLocalDev } from '@/lib/server-env';
import { resolveStaffAccess } from '@/lib/server/merchantStaff';
import { getOwnerProfile, listAccessibleShops } from '@/lib/server/merchantShops';

export function merchantUserId(req: NextRequest): string {
  return (
    req.headers.get('x-user-id') ||
    req.nextUrl.searchParams.get('user_id') ||
    req.nextUrl.searchParams.get('owner_id') ||
    ''
  );
}

export async function assertMerchantAccess(
  userId: string,
  merchantId: string,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  if (!userId || userId === 'guest') {
    if (allowLocalDev()) {
      return { ok: true };
    }
    return { ok: false, response: NextResponse.json({ error: 'auth_required' }, { status: 401 }) };
  }

  const profile = await getOwnerProfile(userId);
  const owned = profile.shops.some((s) => s.id === merchantId && s.status === 'approved');
  if (owned) return { ok: true };

  const perms = await resolveStaffAccess(userId, merchantId);
  if (perms.role === 'staff' && perms.can_accept_orders) {
    return { ok: true };
  }

  if (allowLocalDev()) {
    const accessible = listAccessibleShops(profile);
    if (accessible.some((s) => s.id === merchantId)) {
      return { ok: true };
    }
  }

  return { ok: false, response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
}
