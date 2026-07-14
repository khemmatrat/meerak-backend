import { NextRequest, NextResponse } from 'next/server';
import { proxyMyAdvanceApplications } from '@/lib/server/advanceJobProxy';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';

export async function GET(req: NextRequest) {
  const auth = upstreamAuthFromRequest(req);
  const out = await proxyMyAdvanceApplications(auth);
  if (!out.ok) {
    return NextResponse.json(
      { success: false, applications: [] },
      { status: out.status === 500 ? 502 : out.status },
    );
  }
  return NextResponse.json(out.data);
}
