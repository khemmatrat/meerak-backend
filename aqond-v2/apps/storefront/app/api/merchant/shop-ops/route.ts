import { NextRequest, NextResponse } from 'next/server';
import {
  getShopOpenState,
  setManualShopClosed,
  setItemSoldOut,
  setShopBusyMode,
  updateShopOps,
} from '@/lib/server/merchantShopOps';
import { appendMerchantAudit } from '@/lib/server/merchantAudit';
import { bangkokScheduleLabel } from '@/lib/server/thaiTime';
import { assertMerchantAccess, merchantUserId } from '@/lib/server/merchantAuth';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';

export async function GET(req: NextRequest) {
  const merchantId = req.nextUrl.searchParams.get('merchant_id');
  if (!merchantId) {
    return NextResponse.json({ error: 'merchant_id required' }, { status: 400 });
  }
  const access = await assertMerchantAccess(merchantUserId(req), merchantId);
  if (!access.ok) return access.response;
  const state = await getShopOpenState(merchantId);
  return NextResponse.json({
    merchant_id: merchantId,
    effective_open: state.effective_open,
    reason: state.reason,
    label: state.label,
    timezone: 'Asia/Bangkok',
    schedule_hint: bangkokScheduleLabel(state.ops.open_time, state.ops.close_time),
    ops: state.ops,
    sold_out_item_ids: state.ops.sold_out_item_ids,
    busy_extra_min: state.ops.busy_mode ? state.ops.busy_extra_minutes : 0,
  });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const merchantId = body.merchant_id;
  if (!merchantId) {
    return NextResponse.json({ error: 'merchant_id required' }, { status: 400 });
  }
  const access = await assertMerchantAccess(merchantUserId(req), merchantId);
  if (!access.ok) return access.response;

  const action = body.action || 'update';
  const actor = body.actor || 'merchant';
  const auth = upstreamAuthFromRequest(req);

  if (action === 'manual_close') {
    const state = await setManualShopClosed(
      merchantId,
      !!body.closed,
      body.note || body.closed_note,
      auth,
    );
    await appendMerchantAudit({
      merchant_id: merchantId,
      actor,
      action: body.closed ? 'emergency_close' : 'emergency_open',
      summary: body.closed ? 'ปิดร้านฉุกเฉิน' : 'เปิดร้าน (ยกเลิกปิดฉุกเฉิน)',
      meta: { note: body.note || body.closed_note },
    });
    return NextResponse.json({
      ok: true,
      effective_open: state.effective_open,
      label: state.label,
      ops: state.ops,
    });
  }

  if (action === 'busy') {
    const mins = body.minutes === 30 ? 30 : body.minutes === 15 ? 15 : 0;
    const state = await setShopBusyMode(merchantId, mins as 0 | 15 | 30, auth);
    await appendMerchantAudit({
      merchant_id: merchantId,
      actor,
      action: 'busy_mode',
      summary: mins ? `โหมดคิวเยอะ +${mins} นาที` : 'ปิดโหมดคิวเยอะ',
      meta: { minutes: mins },
    });
    return NextResponse.json({
      ok: true,
      effective_open: state.effective_open,
      label: state.label,
      ops: state.ops,
      busy_label: state.busy_label,
    });
  }

  if (action === 'sold_out' && body.item_id) {
    const ops = await setItemSoldOut(merchantId, body.item_id, !!body.sold_out, auth);
    await appendMerchantAudit({
      merchant_id: merchantId,
      actor,
      action: body.sold_out ? 'item_sold_out' : 'item_restock',
      summary: body.sold_out ? `ทำเครื่องหมายของหมด: ${body.item_id}` : `คืนสต็อก: ${body.item_id}`,
      meta: { item_id: body.item_id, item_title: body.item_title },
    });
    const state = await getShopOpenState(merchantId);
    return NextResponse.json({
      ok: true,
      item_id: body.item_id,
      sold_out: !!body.sold_out,
      sold_out_item_ids: ops.sold_out_item_ids,
      effective_open: state.effective_open,
    });
  }

  const state = await updateShopOps(merchantId, {
    auto_schedule: body.auto_schedule,
    open_time: body.open_time,
    close_time: body.close_time,
    manual_closed: body.manual_closed,
    closed_note: body.closed_note,
    auto_accept_orders: body.auto_accept_orders,
  }, auth);

  return NextResponse.json({
    ok: true,
    effective_open: state.effective_open,
    label: state.label,
    ops: state.ops,
  });
}
