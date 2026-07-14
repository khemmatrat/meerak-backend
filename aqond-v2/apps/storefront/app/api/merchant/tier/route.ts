import { NextRequest, NextResponse } from 'next/server';
import { merchantOpsApi } from '@/lib/server/merchantOpsClient';
import { upstreamAuthFromRequest, upstreamAuthHeaders } from '@/lib/server/upstreamAuth';

export async function GET(req: NextRequest) {
  const merchantId = req.nextUrl.searchParams.get('merchant_id');
  if (!merchantId) {
    return NextResponse.json({ error: 'merchant_id required' }, { status: 400 });
  }
  try {
    const res = await fetch(
      `${merchantOpsApi('/v1/merchant-ops/tier')}?merchant_id=${encodeURIComponent(merchantId)}`,
      { cache: 'no-store', headers: upstreamAuthHeaders(upstreamAuthFromRequest(req)) },
    );
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'tier_unavailable' }, { status: 503 });
  }
}
