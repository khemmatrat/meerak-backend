import { NextRequest, NextResponse } from 'next/server';
import { kongBase } from '@/lib/server-env';

const LIVE_BASE = process.env.LIVE_COMMERCE_URL || `${kongBase()}/api/v1/live-commerce`;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = body.action || 'confirm';
  const path =
    action === 'address'
      ? '/v1/live/order/address'
      : action === 'draft'
        ? '/v1/live/order/draft'
        : '/v1/live/order/confirm';
  try {
    const res = await fetch(`${LIVE_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Aqond-Region': 'TH' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'live_commerce_unavailable' }, { status: 503 });
  }
}
