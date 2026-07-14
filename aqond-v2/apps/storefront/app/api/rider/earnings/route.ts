import { NextRequest, NextResponse } from 'next/server';
import { dispatchApi, allowLocalOrders } from '@/lib/server-env';

async function localEarnings(riderId: string) {
  const fs = await import('fs/promises');
  const path = await import('path');
  const file = path.join(process.cwd(), '.data', 'dev', 'dispatch-jobs.json');
  try {
    const raw = await fs.readFile(file, 'utf8');
    const jobs = (JSON.parse(raw).jobs || []) as Array<{
      rider_id?: string;
      status: string;
      amount_micro?: number;
    }>;
    const mine = jobs.filter((j) => j.rider_id === riderId && j.status === 'completed');
    const earningsMicro = mine.reduce((s, j) => s + Math.round((j.amount_micro || 0) * 0.18), 0);
    return {
      rider_id: riderId,
      earnings_micro: earningsMicro,
      withdrawable_micro: earningsMicro,
      completed_jobs: mine.length,
      kyc_status: 'approved',
      source: 'local-dispatch',
    };
  } catch {
    return {
      rider_id: riderId,
      earnings_micro: 0,
      withdrawable_micro: 0,
      completed_jobs: 0,
      kyc_status: 'pending',
      source: 'local-dispatch',
    };
  }
}

export async function GET(req: NextRequest) {
  const riderId = req.nextUrl.searchParams.get('rider_id') || '';
  const userId = req.nextUrl.searchParams.get('user_id') || '';
  const q = new URLSearchParams();
  if (riderId) q.set('rider_id', riderId);
  if (userId) q.set('user_id', userId);
  try {
    const res = await fetch(`${dispatchApi('/v1/dispatch/riders/me/earnings')}?${q}`, {
      cache: 'no-store',
      headers: { 'X-Aqond-Region': 'TH' },
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return NextResponse.json(data);
    if (allowLocalOrders() && riderId) {
      return NextResponse.json(await localEarnings(riderId));
    }
    return NextResponse.json(data, { status: res.status });
  } catch (e: unknown) {
    if (allowLocalOrders() && riderId) {
      return NextResponse.json(await localEarnings(riderId));
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unreachable' }, { status: 503 });
  }
}
