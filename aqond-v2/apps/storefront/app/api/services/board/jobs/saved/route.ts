import { NextRequest, NextResponse } from 'next/server';
import { proxySavedAdvanceJobs } from '@/lib/server/advanceJobProxy';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';

export async function GET(req: NextRequest) {
  const auth = upstreamAuthFromRequest(req);
  const out = await proxySavedAdvanceJobs(auth);
  if (!out.ok) {
    return NextResponse.json(
      { success: false, jobs: [] },
      { status: out.status === 500 ? 502 : out.status },
    );
  }
  return NextResponse.json(out.data);
}
