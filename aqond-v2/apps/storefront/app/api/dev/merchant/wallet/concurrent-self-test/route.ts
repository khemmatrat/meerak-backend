import { NextResponse } from 'next/server';
import { runWalletCreditConcurrentSelfTest } from '@/lib/server/merchantWalletStore';

export const dynamic = 'force-dynamic';

/** Dev-only — concurrent merchant-wallet credit integrity check (no lost update / idempotent). */
export async function POST(req: Request) {
  let workers = 20;
  try {
    const body = (await req.json()) as { workers?: number } | null;
    if (body && Number.isFinite(body.workers)) workers = Number(body.workers);
  } catch {
    /* default workers */
  }
  const result = await runWalletCreditConcurrentSelfTest({ workers });
  return NextResponse.json({ ok: result.pass, scenario: 'FindingD-wallet-concurrent', ...result });
}
