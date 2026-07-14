import { NextRequest, NextResponse } from 'next/server';
import { proxyBookingProviders } from '@/lib/server/bookingProxy';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';

export async function GET(req: NextRequest) {
  const auth = upstreamAuthFromRequest(req);
  const category = req.nextUrl.searchParams.get('category') || undefined;
  const verified = req.nextUrl.searchParams.get('verified') || undefined;
  const out = await proxyBookingProviders({ category, verified }, auth);
  if (!out.ok) return NextResponse.json([], { status: out.status === 500 ? 502 : 200 });
  return NextResponse.json(Array.isArray(out.data) ? out.data : []);
}
