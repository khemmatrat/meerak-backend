import { NextRequest, NextResponse } from 'next/server';
import { fetchOrderDetail } from '@/lib/server/orderDetail';
import {
  buildSignedReceiptVerifyUrl,
  signReceiptVerifyToken,
  validateReceiptVerifyToken,
} from '@/lib/server/receiptVerify';
import { MARKETPLACE_RECEIPT_TEMPLATE_ID, RECEIPT_CORE_VERSION } from '@aqond/receipt-core';

export const dynamic = 'force-dynamic';

/** B2.6-S003 — Receipt verify API with signed anti-forgery token. */
export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get('order_id') || '';
  const buyerId = req.nextUrl.searchParams.get('buyer_id') || '';
  const token = req.nextUrl.searchParams.get('v') || '';
  if (!orderId) {
    return NextResponse.json({ ok: false, error: 'order_id_required' }, { status: 400 });
  }

  const tokenValid = validateReceiptVerifyToken(orderId, token);
  if (!tokenValid) {
    return NextResponse.json(
      {
        ok: false,
        verified: false,
        scenario: 'B2.6-S003',
        error: 'invalid_verify_token',
        note: 'Receipt QR signature invalid — not a payment QR',
      },
      { status: 403 },
    );
  }

  const order = await fetchOrderDetail(orderId, buyerId || undefined);
  if (!order) {
    return NextResponse.json(
      { ok: false, error: 'order_not_found', verified: false, scenario: 'B2.6-S003' },
      { status: 404 },
    );
  }

  const baseUrl = req.nextUrl.origin;
  const verifyUrl = buildSignedReceiptVerifyUrl(orderId, baseUrl, buyerId || order.buyer_id);

  return NextResponse.json({
    ok: true,
    verified: true,
    scenario: 'B2.6-S003',
    mission: 'RECEIPT-CORE',
    receipt_type: 'R001',
    template_id: MARKETPLACE_RECEIPT_TEMPLATE_ID,
    verify_url: verifyUrl,
    verify_token: signReceiptVerifyToken(orderId),
    token_valid: true,
    order_id: order.order_id,
    order_number: `#${order.order_id.slice(-8)}`,
    receipt_number: `AQ-RCP-${order.order_id.slice(-12).toUpperCase()}`,
    merchant_name: order.merchant_name || order.merchant_id,
    amount_thb: ((order.amount_micro || 0) / 100).toFixed(2),
    payment_method: order.method,
    payment_status: order.payment_status || order.status,
    created_at: order.created_at,
    metadata: {
      receipt_version: RECEIPT_CORE_VERSION,
      template_id: MARKETPLACE_RECEIPT_TEMPLATE_ID,
      template_version: '1.0.0',
      receipt_type: 'R001',
      language: 'TH',
      currency: 'THB',
      timezone: 'Asia/Bangkok',
      generated_by: 'AQOND',
      environment: process.env.NODE_ENV === 'development' ? 'development' : 'production',
    },
    note: 'Receipt authenticity verification — not a payment QR',
  });
}
