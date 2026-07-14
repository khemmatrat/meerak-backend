import { NextRequest, NextResponse } from 'next/server';
import { meerakBackendBase } from '@/lib/server-env';

/** Proxy legacy FCM register (mobile + landing) → meerak backend. */
export async function POST(req: NextRequest) {
  const base = meerakBackendBase();
  const body = await req.text();
  try {
    const res = await fetch(`${base}/api/notifications/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      cache: 'no-store',
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/json' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'upstream_error';
    return NextResponse.json({ error: 'backend_unreachable', detail: msg }, { status: 502 });
  }
}
