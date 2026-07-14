import { NextRequest, NextResponse } from 'next/server';
import { fetchOrderDetail } from '@/lib/server/orderDetail';
import { renderMarketplaceOrderReceipt } from '@/lib/server/receiptEngine';

type Params = { params: { id: string } };

export const dynamic = 'force-dynamic';

/** B2.6-S002 — Marketplace R001 receipt via Receipt Core (Unicode-safe). */
export async function GET(req: NextRequest, { params }: Params) {
  const buyerId = req.nextUrl.searchParams.get('buyer_id') || '';
  const order = await fetchOrderDetail(params.id, buyerId);
  if (!order) {
    return NextResponse.json({ error: 'order_not_found' }, { status: 404 });
  }

  const baseUrl = req.nextUrl.origin;
  const rendered = await renderMarketplaceOrderReceipt(order, { baseUrl });
  if (!rendered.validation.ok) {
    return NextResponse.json(
      { ok: false, scenario: 'B2.6-S002', validation: rendered.validation },
      { status: 500 },
    );
  }

  return new NextResponse(Buffer.from(rendered.pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="receipt-${order.order_id.slice(-8)}.pdf"`,
      'Cache-Control': 'no-store',
      'X-Aqond-Receipt-Core': 'receipt-core',
      'X-Aqond-Receipt-Scenario': 'B2.6-S002',
      'X-Aqond-Receipt-Type': 'R001',
      'X-Aqond-Receipt-Verify': rendered.verify_url,
      ...(rendered.jarvis_audit_id
        ? { 'X-Aqond-Receipt-Jarvis': rendered.jarvis_audit_id }
        : {}),
    },
  });
}
