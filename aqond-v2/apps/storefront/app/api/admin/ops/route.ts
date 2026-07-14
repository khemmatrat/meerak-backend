import { NextRequest, NextResponse } from 'next/server';
import { dispatchApi } from '@/lib/server-env';

export async function GET(req: NextRequest) {
  const view = req.nextUrl.searchParams.get('view') || 'heatmap';
  try {
    if (view === 'batches') {
      const riderId = req.nextUrl.searchParams.get('rider_id') || '';
      const q = riderId ? `?rider_id=${encodeURIComponent(riderId)}` : '';
      const res = await fetch(`${dispatchApi('/v1/dispatch/batches')}${q}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      return NextResponse.json(data, { status: res.status });
    }
    const res = await fetch(dispatchApi('/v1/dispatch/ops/heatmap'), { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'dispatch_ops_unavailable' }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  try {
    const res = await fetch(dispatchApi('/v1/dispatch/batches'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Aqond-Region': 'TH' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'batch_create_failed' }, { status: 503 });
  }
}
