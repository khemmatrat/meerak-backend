import { NextRequest, NextResponse } from 'next/server';
import { allowLocalDev, dispatchApi } from '@/lib/server-env';
import { localRegisterRider, localRiderToProfile } from '@/lib/server/localDispatchRiders';
import { registerDeliveryPartnerCentral } from '@/lib/server/meerakPartner';
import { upstreamAuthFromRequest, upstreamAuthHeaders } from '@/lib/server/upstreamAuth';

/**
 * Delivery partner signup:
 * 1) dispatch-svc — operational rider id (v2)
 * 2) Central backend (nexus-admin / KYC review) — source of truth for admin
 * 3) Local JSON store — auto-approved in AQOND_LOCAL_DEV for end-to-end testing
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const auth = upstreamAuthFromRequest(req);
  const userId = auth.userId || body.user_id;

  if (!userId) {
    return NextResponse.json(
      { error: 'login_required', message: 'กรุณาเข้าสู่ระบบก่อนสมัคร' },
      { status: 401 },
    );
  }

  const displayName = String(body.display_name || '').trim();
  const phone = String(body.phone || '').trim();
  const plate = String(body.plate || '').trim();
  const bankAccount = String(body.bank_account || '').trim();

  if (!displayName || !phone || !plate || !bankAccount) {
    return NextResponse.json(
      { error: 'missing_fields', message: 'กรุณากรอกข้อมูลให้ครบ' },
      { status: 400 },
    );
  }

  let dispatchData: Record<string, unknown> = {};
  let dispatchOk = false;

  try {
    const res = await fetch(dispatchApi('/v1/dispatch/riders'), {
      method: 'POST',
      headers: upstreamAuthHeaders({ ...auth, userId }),
      body: JSON.stringify({ ...body, user_id: userId }),
    });
    dispatchData = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    dispatchOk = res.ok;
    if (res.status === 409) {
      dispatchData.rider_id = dispatchData.rider_id || (dispatchData as { rider_id?: string }).rider_id;
      dispatchOk = true;
    }
  } catch {
    /* dispatch optional when central or local succeeds */
  }

  const central = await registerDeliveryPartnerCentral(
    {
      display_name: displayName,
      phone,
      vehicle: body.vehicle || 'motorcycle',
      plate,
      bank_account: bankAccount,
      dispatch_rider_id: dispatchData.rider_id ? String(dispatchData.rider_id) : undefined,
    },
    auth,
  );

  if (allowLocalDev()) {
    const local = await localRegisterRider(userId, {
      display_name: displayName,
      phone,
      vehicle: body.vehicle || 'motorcycle',
      plate,
      bank_account: bankAccount,
    });
    const riderId =
      dispatchOk && dispatchData.rider_id ? String(dispatchData.rider_id) : local.rider_id;
    const profile = localRiderToProfile({ ...local, rider_id: riderId });
    const { openRiderCreditLine } = await import('@/lib/server/riderCreditLine');
    await openRiderCreditLine(riderId, userId).catch(() => null);
    const alreadyRegistered = central.status === 409;

    return NextResponse.json(
      {
        ...profile,
        dispatch_ok: dispatchOk,
        admin_submitted: central.ok,
        already_registered: alreadyRegistered,
        message: alreadyRegistered
          ? 'บัญชีนี้มีผู้ให้บริการแล้ว — พร้อมรับงาน'
          : central.ok
            ? 'สมัครสำเร็จ — พร้อมรับงาน (local dev) แอดมินตรวจสอบในพื้นหลัง'
            : 'สมัครสำเร็จ — พร้อมรับงาน',
      },
      { status: alreadyRegistered ? 409 : 200 },
    );
  }

  if (central.ok) {
    return NextResponse.json({
      ...central.data,
      rider_id: dispatchData.rider_id,
      kyc_status: dispatchData.kyc_status || central.data.status || 'pending',
      dispatch_ok: dispatchOk,
      message:
        (central.data.message as string) ||
        'ส่งข้อมูลแล้ว — แอดมินจะตรวจสอบใน Nexus Admin (KYC Review)',
    });
  }

  if (central.status === 409) {
    return NextResponse.json(
      {
        ...central.data,
        rider_id: dispatchData.rider_id,
        dispatch_ok: dispatchOk,
      },
      { status: 409 },
    );
  }

  if (dispatchOk) {
    return NextResponse.json({
      ...dispatchData,
      warning: 'บันทึกงานส่งเท่านั้น — ยังไม่ได้ส่งเข้าระบบแอดมิน (backend offline)',
    });
  }

  return NextResponse.json(
    {
      error: central.data.error || 'admin_register_failed',
      message:
        (central.data.message as string) ||
        'ไม่สามารถส่งข้อมูลไประบบแอดมินได้ — ตรวจสอบ backend (port 3001)',
      detail: central.data.detail,
    },
    { status: central.status >= 400 ? central.status : 502 },
  );
}
