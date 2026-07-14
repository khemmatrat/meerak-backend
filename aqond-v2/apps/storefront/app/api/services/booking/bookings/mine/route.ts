import { NextRequest, NextResponse } from 'next/server';
import { proxyMyBookingRequests } from '@/lib/server/bookingProxy';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';

export async function GET(req: NextRequest) {
  const auth = upstreamAuthFromRequest(req);
  const out = await proxyMyBookingRequests(auth);
  if (!out.ok) return NextResponse.json({ bookings: [] }, { status: out.status === 500 ? 502 : 200 });
  return NextResponse.json(out.data);
}
