import { NextResponse } from 'next/server';
import { runWalletReconcileSelfTest } from '@/lib/server/merchantWalletStore';

export const dynamic = 'force-dynamic';

/** Dev-only — a released hold whose credit was "lost" must be self-healed by reconciliation. */
export async function POST() {
  const result = await runWalletReconcileSelfTest();
  return NextResponse.json({ ok: result.pass, scenario: 'FindingA-wallet-reconcile', ...result });
}
