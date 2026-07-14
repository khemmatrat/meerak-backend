import { NextRequest, NextResponse } from 'next/server';
import { kongBase } from '@/lib/server-env';

export async function GET(req: NextRequest) {
  const intentId = req.nextUrl.searchParams.get('intent_id');
  if (!intentId) {
    return NextResponse.json({ error: 'intent_id required' }, { status: 400 });
  }
  try {
    const res = await fetch(
      `${kongBase()}/api/v1/payment/v1/intents/inquire?id=${encodeURIComponent(intentId)}`,
      { cache: 'no-store', headers: { 'X-Aqond-Region': 'TH' } },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: data.error || 'inquire_failed', paid: false },
        { status: res.status >= 500 ? 503 : res.status },
      );
    }
    return NextResponse.json(data);
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'inquire_unreachable', paid: false },
      { status: 503 },
    );
  }
}
