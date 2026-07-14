import { NextResponse } from 'next/server';
import { runEscrowConcurrentSelfTest } from '@/lib/server/escrowStore';

export const dynamic = 'force-dynamic';

/** Dev-only — concurrent escrow hold integrity check (stripped from production build). */
export async function POST() {
  const result = await runEscrowConcurrentSelfTest();
  return NextResponse.json({ ok: result.pass, scenario: 'B2.7-S003', ...result });
}
