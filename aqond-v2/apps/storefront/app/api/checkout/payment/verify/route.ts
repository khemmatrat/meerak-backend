import { NextRequest, NextResponse } from 'next/server';
import { markOrdersPaymentStatus, readOrdersByIds } from '@/lib/server/orderStore';
import { inquireMarketplacePayment } from '@/lib/server/paymentInquire';
import { confirmPaymentCaptureForOrders } from '@/lib/server/paymentEscrowConfirm';
import {
  ESCROW_CUTOVER_FREEZE_HTTP_STATUS,
  escrowCutoverFreezePayload,
  isEscrowCutoverFrozen,
} from '@/lib/server/escrowCutoverGuard';
import { countActiveHolds } from '@/lib/server/escrowStore';

export type PaymentVerifyStatus = 'success' | 'expired' | 'wrong_type' | 'failed';

type Body = {
  ref?: string;
  order_ids?: string[];
  buyer_id?: string;
  expires_at?: number;
  amount?: string;
  intent_id?: string;
  payso_reference_id?: string;
};

function resolvePaymentRefs(body: Body, orders: Awaited<ReturnType<typeof readOrdersByIds>>) {
  const primary = orders[0];
  const paysoRef =
    body.payso_reference_id?.trim() ||
    body.ref?.trim() ||
    primary?.payso_reference_id?.trim();
  const intentId = body.intent_id?.trim() || primary?.payment_intent_id?.trim();
  return { paysoRef, intentId };
}

function refMatchesOrder(bodyRef: string | undefined, paysoRef: string | undefined, orders: Awaited<ReturnType<typeof readOrdersByIds>>) {
  const storedRefs = orders
    .map((o) => o.payso_reference_id?.trim())
    .filter(Boolean) as string[];
  if (!storedRefs.length) return true;
  const candidate = bodyRef?.trim() || paysoRef?.trim();
  if (!candidate) return false;
  return storedRefs.every((stored) => stored === candidate);
}

export async function POST(req: NextRequest) {
  let body: Body = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ status: 'failed' as PaymentVerifyStatus, error: 'invalid_body' }, { status: 400 });
  }

  const orderIds = (body.order_ids || []).filter(Boolean);
  const expiresAt = body.expires_at || 0;
  const now = Date.now();

  if (isEscrowCutoverFrozen()) {
    return NextResponse.json(escrowCutoverFreezePayload(), { status: ESCROW_CUTOVER_FREEZE_HTTP_STATUS });
  }

  if (expiresAt > 0 && now > expiresAt) {
    if (orderIds.length) await markOrdersPaymentStatus(orderIds, 'failed');
    return NextResponse.json({
      status: 'expired' as PaymentVerifyStatus,
      message: 'การชำระเงินหมดอายุแล้ว',
    });
  }

  if (!body.ref && !body.payso_reference_id) {
    return NextResponse.json({
      status: 'wrong_type' as PaymentVerifyStatus,
      message: 'ประเภทธุรกรรมไม่ถูกต้อง กรุณาตรวจสอบยอดเงินและชำระใหม่',
    });
  }

  if (!orderIds.length) {
    return NextResponse.json({
      status: 'failed' as PaymentVerifyStatus,
      message: 'ไม่พบออเดอร์สำหรับยืนยันการชำระเงิน',
    });
  }

  const existing = await readOrdersByIds(orderIds);
  if (!existing.length) {
    return NextResponse.json({
      status: 'failed' as PaymentVerifyStatus,
      message: 'ไม่พบออเดอร์สำหรับยืนยันการชำระเงิน',
    });
  }

  if (existing.every((o) => o.payment_status === 'paid')) {
    let missingHold = false;
    for (const o of existing) {
      if (o.method !== 'cod' && (await countActiveHolds(o.order_id)) === 0) {
        missingHold = true;
        break;
      }
    }
    if (missingHold) {
      return NextResponse.json({
        status: 'failed' as PaymentVerifyStatus,
        message: 'พบออเดอร์ชำระแล้วแต่ยังไม่มี escrow hold — ต้อง reconcile ก่อน',
      });
    }
    return NextResponse.json({
      status: 'success' as PaymentVerifyStatus,
      message: 'ชำระเงินสำเร็จแล้ว',
      order_ids: orderIds,
      ref: body.ref || body.payso_reference_id,
      duplicate: true,
    });
  }

  if (body.buyer_id && existing.some((o) => o.buyer_id !== body.buyer_id)) {
    return NextResponse.json({
      status: 'failed' as PaymentVerifyStatus,
      message: 'ไม่สามารถยืนยันการชำระเงินได้',
    });
  }

  const { paysoRef, intentId } = resolvePaymentRefs(body, existing);
  if (!refMatchesOrder(body.ref, paysoRef, existing)) {
    return NextResponse.json({
      status: 'failed' as PaymentVerifyStatus,
      message: 'รหัสอ้างอิงการชำระเงินไม่ตรงกับออเดอร์',
    });
  }

  const inquiry = await inquireMarketplacePayment({
    intentId,
    paysoReferenceId: paysoRef,
  });

  if (!inquiry.paid) {
    const pending = inquiry.pending;
    return NextResponse.json({
      status: 'failed' as PaymentVerifyStatus,
      message: pending
        ? 'ยังไม่พบการชำระเงิน กรุณาชำระผ่าน QR แล้วลองใหม่'
        : 'ยังไม่ยืนยันการชำระเงินกับ PaySo — กรุณาชำระให้ครบก่อนกดยืนยัน',
      inquiry_error: inquiry.error,
      payso_status: inquiry.payso_status,
    });
  }

  const capture = await confirmPaymentCaptureForOrders(orderIds, {
    captureKey: paysoRef || intentId,
  });

  return NextResponse.json({
    status: 'success' as PaymentVerifyStatus,
    message: 'ชำระเงินสำเร็จแล้ว',
    order_ids: orderIds,
    ref: paysoRef || body.ref,
    verified_via: inquiry.source,
    escrow_holds: capture.holds,
    duplicate: capture.duplicate,
  });
}
