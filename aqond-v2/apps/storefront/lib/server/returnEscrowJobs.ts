import { loadServerReturnConfig } from '@/lib/server/returnConfigStore';
import { getEscrowStorageBackend } from '@/lib/server/escrowStore';
import { getEscrowDatabase } from '@/lib/server/escrowDbStore';
import { getEscrowPgPool } from '@/lib/server/escrowPgStore';
import { listEscrowHolds } from '@/lib/server/returnEscrowAdapter';
import {
  listAllRefunds,
  listAllReturns,
  updateRefundRecord,
  updateReturnRequest,
} from '@/lib/server/returnStore';

type AutoConfirmResult = {
  scanned: number;
  auto_confirmed: string[];
  skipped: string[];
};

type ReconciliationIssue = {
  kind: 'orphan_hold' | 'missing_hold' | 'amount_mismatch' | 'state_mismatch';
  hold_id?: string;
  refund_id?: string;
  order_id?: string;
  detail: string;
};

export type EscrowReconciliationResult = {
  run_id: string;
  started_at: string;
  finished_at: string;
  held_count: number;
  matched_count: number;
  issues: ReconciliationIssue[];
};

function hoursAgo(iso: string, hours: number): boolean {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts >= hours * 60 * 60 * 1000;
}

function daysAgo(iso: string, days: number): boolean {
  return hoursAgo(iso, days * 24);
}

/** Phase 2 — auto-confirm returns when merchant silence / max window policy triggers. */
export async function runAutoConfirmTimerJob(): Promise<AutoConfirmResult> {
  const loaded = loadServerReturnConfig();
  if (!loaded.config.auto_refund_policy?.enabled) {
    return { scanned: 0, auto_confirmed: [], skipped: [] };
  }

  const silenceRule = loaded.config.auto_refund_policy.rules.find(
    (r) => r.trigger === 'return_delivered_to_merchant' && r.action === 'auto_approve_refund',
  );
  const windowRule = loaded.config.auto_refund_policy.rules.find(
    (r) => r.trigger === 'return_requested' && r.action === 'auto_refund_if_merchant_no_action',
  );

  const returns = await listAllReturns();
  const autoConfirmed: string[] = [];
  const skipped: string[] = [];

  for (const ret of returns) {
    if (['refund_pending', 'refund_completed', 'rejected', 'cancelled'].includes(ret.state)) {
      skipped.push(ret.return_id);
      continue;
    }

    let shouldConfirm = false;
    if (ret.state === 'delivered_merchant' && silenceRule?.merchant_response_hours) {
      shouldConfirm = hoursAgo(ret.updated_at, silenceRule.merchant_response_hours);
    } else if (ret.state === 'requested' && windowRule?.max_days) {
      shouldConfirm = daysAgo(ret.created_at, windowRule.max_days);
    }

    if (!shouldConfirm) {
      skipped.push(ret.return_id);
      continue;
    }

    await updateReturnRequest(ret.return_id, { state: 'refund_pending' });
    if (ret.refund_id) {
      await updateRefundRecord(ret.refund_id, { state: 'processing' });
    }
    autoConfirmed.push(ret.return_id);
  }

  return { scanned: returns.length, auto_confirmed: autoConfirmed, skipped: skipped };
}

/** Phase 2 — reconcile escrow holds vs refund records on SQLite store. */
export async function runEscrowReconciliationJob(): Promise<EscrowReconciliationResult> {
  const startedAt = new Date().toISOString();
  const runId = `recon-${Date.now().toString(36)}`;
  const holds = (await listEscrowHolds()).filter((h) => h.status === 'held');
  const issues: ReconciliationIssue[] = [];
  const allRefunds = await listAllRefunds();

  const refundByHold = new Map(allRefunds.filter((r) => r.escrow_reference).map((r) => [r.escrow_reference!, r]));
  const holdIdsMatched = new Set<string>();
  let matched = 0;

  for (const hold of holds) {
    const refund = refundByHold.get(hold.hold_id);
    if (!refund) {
      issues.push({
        kind: 'orphan_hold',
        hold_id: hold.hold_id,
        order_id: hold.order_id,
        detail: 'Active escrow hold has no linked refund record',
      });
      continue;
    }
    holdIdsMatched.add(hold.hold_id);
    if (refund.state !== 'escrow_held' && refund.state !== 'processing' && refund.state !== 'completed') {
      issues.push({
        kind: 'state_mismatch',
        hold_id: hold.hold_id,
        refund_id: refund.refund_id,
        order_id: hold.order_id,
        detail: `Refund state ${refund.state} while escrow hold is active`,
      });
      continue;
    }
    if (refund.amount_micro !== hold.amount_micro) {
      issues.push({
        kind: 'amount_mismatch',
        hold_id: hold.hold_id,
        refund_id: refund.refund_id,
        order_id: hold.order_id,
        detail: `Refund ${refund.amount_micro} vs hold ${hold.amount_micro} micro`,
      });
      continue;
    }
    matched += 1;
  }

  for (const refund of allRefunds) {
    if (refund.state !== 'escrow_held' || !refund.escrow_reference) continue;
    if (!holdIdsMatched.has(refund.escrow_reference)) {
      issues.push({
        kind: 'missing_hold',
        refund_id: refund.refund_id,
        order_id: refund.order_id,
        detail: `Refund references missing/active hold ${refund.escrow_reference}`,
      });
    }
  }

  const finishedAt = new Date().toISOString();
  const report = {
    run_id: runId,
    started_at: startedAt,
    finished_at: finishedAt,
    held_count: holds.length,
    matched_count: matched,
    orphan_holds: issues.filter((i) => i.kind === 'orphan_hold').length,
    missing_holds: issues.filter((i) => i.kind === 'missing_hold').length,
    amount_mismatches: issues.filter((i) => i.kind === 'amount_mismatch').length,
    issues,
  };

  if (getEscrowStorageBackend() === 'postgres') {
    await getEscrowPgPool().query(
      `INSERT INTO escrow_reconciliation_runs
        (run_id, started_at, finished_at, held_count, matched_count, orphan_holds, missing_holds, amount_mismatches, report_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        runId,
        startedAt,
        finishedAt,
        holds.length,
        matched,
        report.orphan_holds,
        report.missing_holds,
        report.amount_mismatches,
        JSON.stringify(report),
      ],
    );
  } else {
    getEscrowDatabase()
      .prepare(
        `INSERT INTO escrow_reconciliation_runs
        (run_id, started_at, finished_at, held_count, matched_count, orphan_holds, missing_holds, amount_mismatches, report_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        runId,
        startedAt,
        finishedAt,
        holds.length,
        matched,
        report.orphan_holds,
        report.missing_holds,
        report.amount_mismatches,
        JSON.stringify(report),
      );
  }

  return {
    run_id: runId,
    started_at: startedAt,
    finished_at: finishedAt,
    held_count: holds.length,
    matched_count: matched,
    issues,
  };
}

export async function runReturnEscrowPhase2Jobs() {
  const autoConfirm = await runAutoConfirmTimerJob();
  const reconciliation = await runEscrowReconciliationJob();
  return { auto_confirm: autoConfirm, reconciliation };
}
