import { NextRequest, NextResponse } from 'next/server';
import { acceptDispatchJob, advanceDispatchPhase, listDispatchJobs, updateDispatchLocation } from '@/lib/server/dispatchSvc';

export async function GET(req: NextRequest) {
  const riderId = req.nextUrl.searchParams.get('rider_id') || '';
  const status = req.nextUrl.searchParams.get('status') || (riderId ? '' : 'open');
  const data = await listDispatchJobs({
    rider_id: riderId || undefined,
    status: status || undefined,
  });
  if (!data) {
    return NextResponse.json({ jobs: [], source: 'offline' });
  }
  return NextResponse.json({ ...data, source: data.source || 'dispatch-svc' });
}
