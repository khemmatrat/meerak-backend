import { NextRequest, NextResponse } from 'next/server';
import { foodApi } from '@/lib/server-env';
import { upstreamAuthFromRequest, upstreamAuthHeaders } from '@/lib/server/upstreamAuth';

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  if (!body.merchant_id || !Array.isArray(body.item_ids) || !body.item_ids.length) {
    return NextResponse.json({ error: 'merchant_id and item_ids required' }, { status: 400 });
  }
  try {
    const res = await fetch(foodApi('/v1/food/menu/bulk'), {
      method: 'PATCH',
      headers: upstreamAuthHeaders(upstreamAuthFromRequest(req)),
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'food_bulk_unavailable' }, { status: 503 });
  }
}
