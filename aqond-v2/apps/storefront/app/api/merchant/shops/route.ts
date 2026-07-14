import { NextRequest, NextResponse } from 'next/server';

import {
  approveShop,
  createShopRequest,
  getOwnerDashboard,
  rejectShop,
} from '@/lib/server/merchantShops';

import { listStaffShopsForUser } from '@/lib/server/merchantStaff';

import { listMerchantOrders } from '@/lib/server/merchantOrders';

import { slaBreachedOrderIds, MERCHANT_ACCEPT_SLA_MINUTES } from '@/lib/server/merchantSla';
import { assertMerchantAccess, merchantUserId } from '@/lib/server/merchantAuth';
import { allowLocalDev } from '@/lib/server-env';



export async function GET(req: NextRequest) {

  const userId = merchantUserId(req) || (allowLocalDev() ? 'guest' : '');
  if (!userId) {
    return NextResponse.json({ error: 'auth_required' }, { status: 401 });
  }
  const ownerId = req.nextUrl.searchParams.get('owner_id') || userId;



  const dashboard = await getOwnerDashboard(ownerId);

  const staffAccess = await listStaffShopsForUser(userId);



  let accessible_shops = dashboard.accessible_shops;

  if (staffAccess.role === 'staff' && staffAccess.shops.length > 0) {

    accessible_shops = staffAccess.shops.map((s) => ({

      id: s.id,

      name: s.name,

      type: s.type as 'food' | 'marketplace',

      status: 'approved' as const,

    }));

  }



  const pending_badges: Record<string, number> = {};

  const pending_order_ids: Record<string, string[]> = {};

  const sla_breached_ids: Record<string, string[]> = {};

  const sla_breached_counts: Record<string, number> = {};



  for (const shop of accessible_shops) {

    const { orders } = await listMerchantOrders(shop.id);

    const pending = orders.filter(

      (o) => o.fulfillment_status === 'pending_accept' || o.fulfillment_status === 'pending_ship',

    );

    pending_badges[shop.id] = pending.length;

    pending_order_ids[shop.id] = pending.map((o) => String(o.order_id || o.id));

    const slaIds = slaBreachedOrderIds(pending);

    sla_breached_ids[shop.id] = slaIds;

    sla_breached_counts[shop.id] = slaIds.length;

  }



  return NextResponse.json({

    ...dashboard,

    accessible_shops,

    staff_role: staffAccess.role,

    pending_badges,

    pending_order_ids,

    sla_breached_ids,

    sla_breached_counts,

    accept_sla_minutes: MERCHANT_ACCEPT_SLA_MINUTES,

  });

}



export async function POST(req: NextRequest) {

  const body = await req.json();

  const ownerId = body.owner_id || merchantUserId(req) || (allowLocalDev() ? 'guest' : '');
  if (!ownerId || ownerId === 'guest') {
    if (!allowLocalDev()) {
      return NextResponse.json({ error: 'auth_required' }, { status: 401 });
    }
  }

  const action = body.action || 'create';



  if (action === 'create') {

    if (!body.name?.trim()) {

      return NextResponse.json({ error: 'กรุณาระบุชื่อร้าน' }, { status: 400 });

    }

    const result = await createShopRequest(ownerId, {

      name: body.name,

      type: body.type === 'food' ? 'food' : 'marketplace',

    });

    if (result.error) {

      return NextResponse.json({ error: result.error }, { status: 400 });

    }

    return NextResponse.json({

      ok: true,

      shop: result.shop,

      message: 'ส่งคำขอเปิดร้านแล้ว — รอ admin อนุมัติ',

    });

  }



  if (action === 'approve' && body.shop_id) {

    const shop = await approveShop(body.shop_id, body.owner_id);

    if (!shop) return NextResponse.json({ error: 'ไม่พบร้านรออนุมัติ' }, { status: 404 });

    return NextResponse.json({ ok: true, shop, message: 'อนุมัติร้านแล้ว' });

  }



  if (action === 'reject' && body.shop_id) {

    const ok = await rejectShop(body.shop_id, body.reason);

    if (!ok) return NextResponse.json({ error: 'ไม่พบร้าน' }, { status: 404 });

    return NextResponse.json({ ok: true, message: 'ปฏิเสธคำขอแล้ว' });

  }



  return NextResponse.json({ error: 'unknown action' }, { status: 400 });

}


