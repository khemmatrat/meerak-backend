import { NextResponse } from 'next/server';
import { allowLocalOrders } from '@/lib/server-env';
import {
  ESCROW_CUTOVER_FREEZE_HTTP_STATUS,
  escrowCutoverFreezePayload,
  isEscrowCutoverFrozen,
} from '@/lib/server/escrowCutoverGuard';
import { runReturnEscrowPhase2Jobs } from '@/lib/server/returnEscrowJobs';
import { runOrderAutoConfirmJob } from '@/lib/server/orderAutoConfirmJob';

export const dynamic = 'force-dynamic';

/** Phase 2 — cron hook: auto-confirm timer + escrow reconciliation (DB-backed). */
export async function POST(req: Request) {
  if (!allowLocalOrders()) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const url = new URL(req.url);
  const job = url.searchParams.get('job');
  const escrowJob = !job || job === 'order_auto_confirm' || job === 'auto_confirm' || job === 'reconciliation';
  if (escrowJob && isEscrowCutoverFrozen()) {
    return NextResponse.json(escrowCutoverFreezePayload(), { status: ESCROW_CUTOVER_FREEZE_HTTP_STATUS });
  }
  if (job === 'order_auto_confirm') {
    const result = await runOrderAutoConfirmJob();
    return NextResponse.json({ ok: true, order_auto_confirm: result });
  }
  const result = await runReturnEscrowPhase2Jobs();
  if (job === 'auto_confirm') {
    return NextResponse.json({ ok: true, auto_confirm: result.auto_confirm });
  }
  if (job === 'reconciliation') {
    return NextResponse.json({ ok: true, reconciliation: result.reconciliation });
  }
  return NextResponse.json({ ok: true, ...result });
}
