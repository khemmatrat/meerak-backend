import { NextRequest, NextResponse } from 'next/server';
import {
  adminDashboard,
  adminApproveShop,
  adminRejectShop,
  adminResolveDispute,
  adminSettleMerchant,
  verifyAdminKey,
} from '@/lib/server/merchantAdmin';

function check(req: NextRequest) {
  const key = req.headers.get('x-admin-key') || req.nextUrl.searchParams.get('admin_key');
  return verifyAdminKey(key);
}

export async function GET(req: NextRequest) {
  if (!check(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const dash = await adminDashboard();
  try {
    const { dispatchApi } = await import('@/lib/server-env');
    const res = await fetch(dispatchApi('/v1/dispatch/ops/stuck'), {
      cache: 'no-store',
      headers: { 'X-Aqond-Region': 'TH' },
    });
    if (res.ok) {
      const ops = await res.json();
      dash.stuck_dispatch = ops.stuck_jobs || [];
    }
  } catch {
    /* optional */
  }
  return NextResponse.json(dash);
}

export async function POST(req: NextRequest) {
  if (!check(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json();
  const action = body.action;

  if (action === 'approve_shop' && body.shop_id) {
    const shop = await adminApproveShop(body.shop_id, body.owner_id);
    if (!shop) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ ok: true, shop });
  }

  if (action === 'reject_shop' && body.shop_id) {
    const ok = await adminRejectShop(body.shop_id, body.reason);
    if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  if (action === 'resolve_dispute' && body.case_id) {
    const c = await adminResolveDispute(body.case_id, {
      action: body.resolve_action || 'refund',
      note: body.note,
    });
    if (!c) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ ok: true, case: c });
  }

  if (action === 'settle_wallet' && body.merchant_id) {
    const w = await adminSettleMerchant(body.merchant_id);
    return NextResponse.json({ ok: true, wallet: w });
  }

  if (action === 'approve_rider' && body.rider_id) {
    const { dispatchApi } = await import('@/lib/server-env');
    const res = await fetch(dispatchApi(`/v1/dispatch/riders/${body.rider_id}/approve`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Aqond-Region': 'TH' },
      body: '{}',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json({ ok: true, ...data });
  }

  if (action === 'suspend_rider' && body.rider_id) {
    const { dispatchApi } = await import('@/lib/server-env');
    const res = await fetch(dispatchApi(`/v1/dispatch/riders/${body.rider_id}/suspend`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Aqond-Region': 'TH' },
      body: JSON.stringify({ suspended: body.suspended !== false, reason: body.reason }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json({ ok: true, ...data });
  }

  if (action === 'approve_rider_payout' && body.rider_id && body.payout_id) {
    const { dispatchApi } = await import('@/lib/server-env');
    const res = await fetch(
      dispatchApi(`/v1/dispatch/riders/${body.rider_id}/payouts/${body.payout_id}`),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Aqond-Region': 'TH' },
        body: '{}',
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json({ ok: true, ...data });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
