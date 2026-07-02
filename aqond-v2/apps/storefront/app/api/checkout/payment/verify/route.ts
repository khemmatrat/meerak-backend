import { NextRequest, NextResponse } from 'next/server';
import { markOrdersPaymentStatus, readOrdersByIds } from '@/lib/server/orderStore';

export type PaymentVerifyStatus = 'success' | 'expired' | 'wrong_type' | 'failed';

type Body = {
  ref?: string;
  order_ids?: string[];
  buyer_id?: string;
  expires_at?: number;
  amount?: string;
};

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

  if (expiresAt > 0 && now > expiresAt) {
    if (orderIds.length) await markOrdersPaymentStatus(orderIds, 'failed');
    return NextResponse.json({
      status: 'expired' as PaymentVerifyStatus,
      message: 'การชำระเงินหมดอายุแล้ว',
    });
  }

  if (!body.ref) {
    return NextResponse.json({
      status: 'wrong_type' as PaymentVerifyStatus,
      message: 'ประเภทธุรกรรมไม่ถูกต้อง กรุณาตรวจสอบยอดเงินและชำระใหม่',
    });
  }

  if (orderIds.length) {
    const existing = await readOrdersByIds(orderIds);
    if (existing.length && existing.every((o) => o.payment_status === 'paid')) {
      return NextResponse.json({
        status: 'success' as PaymentVerifyStatus,
        message: 'ชำระเงินสำเร็จแล้ว',
        order_ids: orderIds,
        ref: body.ref,
        duplicate: true,
      });
    }
    if (body.buyer_id && existing.some((o) => o.buyer_id !== body.buyer_id)) {
      return NextResponse.json({
        status: 'failed' as PaymentVerifyStatus,
        message: 'ไม่สามารถยืนยันการชำระเงินได้',
      });
    }
    await markOrdersPaymentStatus(orderIds, 'paid');
  }

  return NextResponse.json({
    status: 'success' as PaymentVerifyStatus,
    message: 'ชำระเงินสำเร็จแล้ว',
    order_ids: orderIds,
    ref: body.ref,
  });
}
