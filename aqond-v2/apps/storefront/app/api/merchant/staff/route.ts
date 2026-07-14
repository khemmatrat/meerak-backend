import { NextRequest, NextResponse } from 'next/server';
import {
  addStaffMember,
  listStaffForOwner,
  removeStaffMember,
  resolveStaffAccess,
} from '@/lib/server/merchantStaff';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';

export async function GET(req: NextRequest) {
  const ownerId = req.nextUrl.searchParams.get('owner_id') || 'guest';
  const merchantId = req.nextUrl.searchParams.get('merchant_id') || '';
  const userId = req.nextUrl.searchParams.get('user_id') || ownerId;
  const members = await listStaffForOwner(ownerId);
  const permissions = await resolveStaffAccess(userId, merchantId, ownerId);
  return NextResponse.json({ members, permissions });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const ownerId = body.owner_id || 'guest';
  const action = body.action || 'add';
  const auth = upstreamAuthFromRequest(req);

  if (action === 'add') {
    if (!body.user_id?.trim() || !body.display_name?.trim()) {
      return NextResponse.json({ error: 'กรอก user_id และชื่อ' }, { status: 400 });
    }
    const member = await addStaffMember({
      owner_id: ownerId,
      user_id: body.user_id,
      display_name: body.display_name,
      shop_ids: body.shop_ids || ['*'],
    }, auth);
    return NextResponse.json({ ok: true, member });
  }

  if (action === 'remove' && body.staff_id) {
    const ok = await removeStaffMember(ownerId, body.staff_id, auth);
    if (!ok) return NextResponse.json({ error: 'ไม่พบพนักงาน' }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
