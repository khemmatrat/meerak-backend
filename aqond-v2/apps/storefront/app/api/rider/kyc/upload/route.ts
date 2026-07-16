import { NextRequest, NextResponse } from 'next/server';
import { meerakBackendBase } from '@/lib/server-env';
import { upstreamAuthFromRequest, upstreamAuthHeaders } from '@/lib/server/upstreamAuth';

export async function POST(req: NextRequest) {
  const auth = upstreamAuthFromRequest(req);
  const form = await req.formData();
  const file = form.get('file');
  const documentType = String(form.get('documentType') || 'rider_kyc');

  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'file required' }, { status: 400 });
  }

  const upstream = new FormData();
  upstream.append('file', file);
  upstream.append('documentType', documentType);

  const base = meerakBackendBase();
  const res = await fetch(`${base}/api/upload/document`, {
    method: 'POST',
    headers: upstreamAuthHeaders(auth),
    body: upstream,
    signal: AbortSignal.timeout(60_000),
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
