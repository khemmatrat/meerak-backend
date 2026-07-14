import { NextRequest, NextResponse } from 'next/server';
import { proxyPaymentCreateIntent } from '@/lib/server/matchJobProxy';
import { upstreamAuthFromRequest } from '@/lib/server/upstreamAuth';

export async function POST(req: NextRequest) {
  const auth = upstreamAuthFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const jobId = String(body.jobId || body.job_id || '').trim();
  if (!jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 });
  const out = await proxyPaymentCreateIntent(
    {
      jobId,
      discountAmount: body.discountAmount ?? body.discount ?? 0,
      has_insurance: body.has_insurance === true || body.hasInsurance === true,
      maturityVoucherId: body.maturityVoucherId ?? body.maturity_voucher_id ?? undefined,
    },
    auth,
  );
  if (!out.ok) {
    return NextResponse.json(out.data, { status: out.status === 500 ? 502 : out.status });
  }
  return NextResponse.json(out.data);
}
