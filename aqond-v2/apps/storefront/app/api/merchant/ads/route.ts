import { NextRequest, NextResponse } from 'next/server';
import { recsysApi } from '@/lib/server-env';
import { upstreamAuthFromRequest, upstreamAuthHeaders } from '@/lib/server/upstreamAuth';

export async function GET(req: NextRequest) {
  const merchantId = req.nextUrl.searchParams.get('merchant_id');
  if (!merchantId) {
    return NextResponse.json({ error: 'merchant_id required' }, { status: 400 });
  }
  try {
    const res = await fetch(
      `${recsysApi('/v1/ads/campaigns')}?merchant_id=${encodeURIComponent(merchantId)}`,
      { cache: 'no-store', headers: upstreamAuthHeaders(upstreamAuthFromRequest(req)) },
    );
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ campaigns: [] }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.merchant_id || !body.name) {
    return NextResponse.json({ error: 'merchant_id and name required' }, { status: 400 });
  }
  try {
    const res = await fetch(recsysApi('/v1/ads/campaigns'), {
      method: 'POST',
      headers: upstreamAuthHeaders(upstreamAuthFromRequest(req)),
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'recsys_unavailable' }, { status: 503 });
  }
}
