/**
 * Daily bank reconcile export — HMAC row integrity + CSV (UTF-8 BOM for Excel TH)
 */
import crypto from 'crypto';

export function reconcileRowHmac(row, secret) {
  if (!secret || String(secret).length < 8) {
    throw new Error('RECONCILE_CSV_HMAC_SECRET or JWT_SECRET must be set for transaction_hash');
  }
  const p = [
    String(row.id ?? ''),
    String(row.amount ?? ''),
    String(row.bank_ref_id ?? ''),
    row.reviewed_at ? new Date(row.reviewed_at).toISOString() : '',
    String(row.reviewed_by ?? ''),
    String(row.ledger_id ?? ''),
  ].join('|');
  return crypto.createHmac('sha256', secret).update(p).digest('hex');
}

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * CSV columns aligned for matching with Thai bank statements (date ref, amount, bank ref, audit hash).
 */
export function dailyReconcileToCsv(rows, reportDate) {
  const sep = ',';
  const BOM = '\ufeff';
  const headers = [
    'report_date',
    'approved_at_bkk',
    'deposit_id',
    'bank_ref_id',
    'amount_thb',
    'user_email',
    'ledger_id',
    'approved_by',
    'transaction_hash',
  ];
  const lines = [headers.join(sep)];
  for (const r of rows) {
    lines.push(
      [
        csvEscape(reportDate),
        csvEscape(r.approved_at_bkk),
        csvEscape(r.id),
        csvEscape(r.bank_ref_id),
        csvEscape(r.amount_thb),
        csvEscape(r.user_email),
        csvEscape(r.ledger_id),
        csvEscape(r.approved_by),
        csvEscape(r.transaction_hash),
      ].join(sep)
    );
  }
  return BOM + lines.join('\r\n');
}
