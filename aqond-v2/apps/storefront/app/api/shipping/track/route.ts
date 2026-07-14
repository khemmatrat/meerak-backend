import { NextRequest, NextResponse } from 'next/server';
import { shippingApi } from '@/lib/server/merchantApi';

export async function GET(req: NextRequest) {
  const trackingNo = req.nextUrl.searchParams.get('tracking_no');
  if (!trackingNo) {
    return NextResponse.json({ error: 'tracking_no required' }, { status: 400 });
  }
  try {
    const res = await fetch(
      `${shippingApi('/v1/shipping/track')}?tracking_no=${encodeURIComponent(trackingNo)}`,
      { headers: { 'X-Aqond-Region': 'TH' }, cache: 'no-store' },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'shipping_svc_unreachable';
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
