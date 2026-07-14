import { NextResponse } from 'next/server';
import { runPlatformCommissionSelfTest } from '@/lib/server/platformCommissionSelfTest';

export const dynamic = 'force-dynamic';

/** Dev-only — platform commission accrue/release/refund integrity (stripped from production build). */
export async function POST() {
  const result = await runPlatformCommissionSelfTest();
  return NextResponse.json({ ok: result.pass, scenario: 'platform-commission', ...result });
}
