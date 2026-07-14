/**
 * Reconciliation upload: parse CSV (or JSON rows) → external_rows → runReconciliation.
 * Logs who uploaded, source, checksum, run_id immutably (reconciliation_uploads + financial_audit_log).
 */
import crypto from "crypto";
import { getPool } from "../store";
import {
  runReconciliation,
  type ReconGateway,
  type ExternalRow,
  type ReconRunResult,
} from "./reconciliation.service";

export interface UploadResult extends ReconRunResult {
  upload_id: string;
  checksum: string;
  row_count: number;
}

/**
 * Parse CSV text to ExternalRow[].
 * Expected columns: ref (or transaction_no), amount, date. Header optional.
 */
export function parseCsvToExternalRows(csvText: string): ExternalRow[] {
  const lines = csvText
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (lines.length === 0) return [];

  const first = lines[0];
  const isHeader =
    /^[\w\s,]+$/i.test(first) &&
    (first.toLowerCase().includes("ref") ||
      first.toLowerCase().includes("transaction") ||
      first.toLowerCase().includes("amount"));
  const dataLines = isHeader ? lines.slice(1) : lines;

  const rows: ExternalRow[] = [];
  for (const line of dataLines) {
    const parts = line
      .split(",")
      .map((p) => p.trim().replace(/^["']|["']$/g, ""));
    if (parts.length < 2) continue;
    let ref = "";
    let amount = 0;
    let date = "";
    if (parts.length >= 3) {
      ref = parts[0];
      amount = parseFloat(parts[1]) || 0;
      date = parts[2];
    } else {
      ref = parts[0];
      amount = parseFloat(parts[1]) || 0;
      date = new Date().toISOString().slice(0, 10);
    }
    if (ref && !isNaN(amount)) rows.push({ ref, amount, date });
  }
  return rows;
}

function sha256(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Upload settlement file: parse csv_text (or use external_rows), run reconciliation, log upload.
 */
export async function uploadAndReconcile(
  gateway: ReconGateway,
  settlementDate: string,
  csvText: string | null,
  externalRows: ExternalRow[] | null,
  filename: string | null,
  uploadedBy: string,
): Promise<UploadResult> {
  const rows =
    externalRows && externalRows.length > 0
      ? externalRows
      : csvText
        ? parseCsvToExternalRows(csvText)
        : [];
  if (rows.length === 0)
    throw new Error("No rows to reconcile; provide csv_text or external_rows");

  const source = filename ? `file:${filename}` : "json";
  const raw = csvText || JSON.stringify(rows);
  const checksum = sha256(raw);

  const result = await runReconciliation(
    settlementDate,
    gateway,
    rows,
    uploadedBy,
  );

  const pool = getPool();
  if (!pool) throw new Error("Database unavailable");

  const uploadId = (
    await pool.query(
      `INSERT INTO reconciliation_uploads (run_id, uploaded_by, filename, source, checksum, row_count)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        result.run_id,
        uploadedBy,
        filename || null,
        source,
        checksum,
        rows.length,
      ],
    )
  ).rows[0].id;

  await pool.query(
    `INSERT INTO financial_audit_log (actor_type, actor_id, action, entity_type, entity_id, state_after, reason, correlation_id)
     VALUES ('user', $1, 'RECONCILIATION_UPLOAD', 'reconciliation_upload', $2, $3, $4, $5)`,
    [
      uploadedBy,
      uploadId,
      JSON.stringify({
        run_id: result.run_id,
        gateway,
        settlement_date: settlementDate,
        filename: filename || null,
        checksum,
        row_count: rows.length,
        matched_count: result.matched_count,
        missing_external_count: result.missing_external_count,
        missing_internal_count: result.missing_internal_count,
      }),
      `Reconciliation upload: ${gateway} ${settlementDate}`,
      result.run_id,
    ],
  );

  return {
    ...result,
    upload_id: uploadId,
    checksum,
    row_count: rows.length,
  };
}
