import { NextResponse } from 'next/server';
import { runOrderAutoConfirmConcurrentSelfTest } from '@/lib/server/orderAutoConfirmJob';

export const dynamic = 'force-dynamic';

/** Dev-only — concurrent order auto-confirm release integrity (stripped from production build). */
export async function POST() {
  const result = await runOrderAutoConfirmConcurrentSelfTest();
  return NextResponse.json({ ok: result.pass, scenario: 'ORDER-AUTO-CONFIRM', ...result });
}
