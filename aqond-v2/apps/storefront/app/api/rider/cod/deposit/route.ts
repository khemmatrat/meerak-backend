import { NextRequest, NextResponse } from 'next/server';
import { proxyRiderCodDeposit } from '@/lib/server/riderCodProxy';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';

export async function POST(req: NextRequest) {
  const auth = upstreamAuthFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const jobId = String(body.job_id || body.jobId || '').trim();
  if (!jobId) {
    return NextResponse.json({ error: 'job_id required' }, { status: 400 });
  }
  const { ok, status, data } = await proxyRiderCodDeposit(auth, {
    job_id: jobId,
    method: body.method ? String(body.method) : undefined,
    reference: body.reference ? String(body.reference) : undefined,
  });
  return NextResponse.json(data, { status: ok ? 200 : status || 503 });
}
