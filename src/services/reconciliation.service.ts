/**
 * Reconciliation service: match internal ledger vs external (bank/PromptPay/TrueMoney).
 * Writes to reconciliation_runs and reconciliation_lines. Immutable runs.
 */
import { getPool } from "../store";

export type ReconGateway = "promptpay" | "bank_transfer" | "truemoney";

export interface ExternalRow {
  ref: string;
  amount: number;
  date: string;
}

export interface ReconRunResult {
  run_id: string;
  run_date: string;
  gateway: string;
  status: string;
  total_internal_amount: number;
  total_external_amount: number;
  matched_count: number;
  mismatch_count: number;
  missing_internal_count: number;
  missing_external_count: number;
}

export async function runReconciliation(
  runDate: string,
  gateway: ReconGateway,
  externalRows: ExternalRow[],
  actorId?: string,
): Promise<ReconRunResult> {
  const pool = getPool();
  if (!pool) throw new Error("Database unavailable");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const runId = (
      await client.query(
        `INSERT INTO reconciliation_runs (run_date, gateway, status, started_at)
         VALUES ($1, $2, 'pending', CURRENT_TIMESTAMP)
         RETURNING id`,
        [runDate, gateway],
      )
    ).rows[0].id;

    const internal = await client.query(
      `SELECT id, amount::float AS amount, transaction_no, created_at
       FROM ledger_entries
       WHERE gateway = $1
         AND direction = 'credit'
         AND event_type = 'topup'
         AND DATE(created_at AT TIME ZONE 'Asia/Bangkok') = $2
       ORDER BY id`,
      [gateway, runDate],
    );

    const usedExternal = new Set<number>();
    let matchedCount = 0;
    let mismatchCount = 0;
    let missingInternalCount = 0;
    const internalAmounts = internal.rows as {
      id: number;
      amount: number;
      transaction_no: string;
    }[];
    let totalInternal = internalAmounts.reduce((s, r) => s + r.amount, 0);
    let totalExternal = externalRows.reduce((s, r) => s + r.amount, 0);

    for (const int of internalAmounts) {
      const extIdx = externalRows.findIndex(
        (e, i) =>
          !usedExternal.has(i) &&
          e.amount === int.amount &&
          (e.ref === int.transaction_no || e.ref === String(int.id)),
      );
      if (extIdx >= 0) {
        usedExternal.add(extIdx);
        matchedCount++;
        await client.query(
          `INSERT INTO reconciliation_lines (run_id, status, internal_ledger_id, internal_amount, internal_transaction_no, external_ref, external_amount, external_date)
           VALUES ($1, 'matched', $2, $3, $4, $5, $6, $7)`,
          [
            runId,
            int.id,
            int.amount,
            int.transaction_no,
            externalRows[extIdx].ref,
            externalRows[extIdx].amount,
            externalRows[extIdx].date,
          ],
        );
      } else {
        missingExternalCount++;
        await client.query(
          `INSERT INTO reconciliation_lines (run_id, status, internal_ledger_id, internal_amount, internal_transaction_no, mismatch_reason)
           VALUES ($1, 'missing_external', $2, $3, $4, 'No external row matched')`,
          [runId, int.id, int.amount, int.transaction_no],
        );
      }
    }

    let missingInternalCountNum = 0;
    for (let i = 0; i < externalRows.length; i++) {
      if (usedExternal.has(i)) continue;
      missingInternalCountNum++;
      await client.query(
        `INSERT INTO reconciliation_lines (run_id, status, external_ref, external_amount, external_date, mismatch_reason)
         VALUES ($1, 'missing_internal', $2, $3, $4, 'No internal ledger entry matched')`,
        [
          runId,
          externalRows[i].ref,
          externalRows[i].amount,
          externalRows[i].date,
        ],
      );
    }

    const missingExtCount = internal.rows.length - matchedCount;
    const status =
      mismatchCount > 0
        ? "mismatch_found"
        : missingInternalCountNum > 0 || missingExtCount > 0
          ? "mismatch_found"
          : "matched";
    await client.query(
      `UPDATE reconciliation_runs
       SET status = $1, total_internal_amount = $2, total_external_amount = $3,
           matched_count = $4, mismatch_count = $5, missing_internal_count = $6, missing_external_count = $7,
           completed_at = CURRENT_TIMESTAMP
       WHERE id = $8`,
      [
        status,
        totalInternal,
        totalExternal,
        matchedCount,
        mismatchCount,
        missingInternalCountNum,
        missingExtCount,
        runId,
      ],
    );

    await client.query(
      `INSERT INTO financial_audit_log (actor_type, actor_id, action, entity_type, entity_id, state_after, reason, correlation_id)
       VALUES ('system', $1, 'RECONCILIATION_RUN', 'reconciliation_run', $2, $3, $4, $2)`,
      [
        actorId || "system",
        runId,
        JSON.stringify({
          run_date: runDate,
          gateway,
          status,
          matched_count: matchedCount,
        }),
        `Reconciliation run ${runDate} ${gateway}`,
      ],
    );

    await client.query("COMMIT");

    return {
      run_id: runId,
      run_date: runDate,
      gateway,
      status,
      total_internal_amount: totalInternal,
      total_external_amount: totalExternal,
      matched_count: matchedCount,
      mismatch_count: mismatchCount,
      missing_internal_count: missingInternalCountNum,
      missing_external_count: missingExtCount,
    };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
