import { NextResponse } from 'next/server';
import { runOrderAutoConfirmPriorReleaseSelfTest } from '@/lib/server/orderAutoConfirmJob';

export const dynamic = 'force-dynamic';

/** Dev-only — return-rejected / prior escrow release must not double-release on auto-confirm rescan. */
export async function POST() {
  const result = await runOrderAutoConfirmPriorReleaseSelfTest();
  return NextResponse.json({ ok: result.pass, ...result });
}
