import { NextRequest, NextResponse } from 'next/server';
import { proxyRiderCodSummary } from '@/lib/server/riderCodProxy';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';

export async function GET(req: NextRequest) {
  const auth = upstreamAuthFromRequest(req);
  if (!auth.userId && !auth.authorization) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { ok, status, data } = await proxyRiderCodSummary(auth);
  return NextResponse.json(data, { status: ok ? 200 : status || 503 });
}
