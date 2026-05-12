/**
 * Automated Payout Reconciliation — Tier A (Audit traceability)
 *
 * R1 Amount Match: payout_requests.amount vs payment_ledger_audit (user_payout_withdrawal)
 * R2 Evidence: slip_url present and HTTP reachable
 * R3 Duplicate slip: same slip_hash / URL as another settled payout (approved + paid only; excludes self)
 * R4 Timeline: created_at < processed_at (paid/settled) when approved
 * R5 Integrity: SHA-256 of slip file bytes
 *
 * @module payoutReconciliation
 */

import crypto from 'crypto';
import PDFDocument from 'pdfkit';

const MAX_SLIP_BYTES = 10 * 1024 * 1024;
/** R2/R5: slip fetch must not block API (audit hardening) */
const R2_SLIP_TIMEOUT_MS = 5000;
const AMOUNT_EPS = 0.01;

/** All exported reports label dates in Thailand civil time */
export const REPORT_TIMEZONE_LABEL = 'Asia/Bangkok (ICT, UTC+7)';

function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * @param {string} slipUrl
 * @returns {Promise<{ ok: boolean, hash?: string, bytes?: number, error?: string }>}
 */
export async function fetchSlipAndHash(slipUrl) {
  const url = String(slipUrl || '').trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    return { ok: false, error: 'invalid_slip_url' };
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), R2_SLIP_TIMEOUT_MS);
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'AQOND-PayoutReconciliation/1.0' },
    });
    clearTimeout(t);
    if (!res.ok) {
      return { ok: false, error: `http_${res.status}` };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) {
      return { ok: false, error: 'empty_body' };
    }
    if (buf.length > MAX_SLIP_BYTES) {
      return { ok: false, error: 'file_too_large' };
    }
    return { ok: true, hash: sha256Hex(buf), bytes: buf.length };
  } catch (e) {
    return { ok: false, error: e?.name === 'AbortError' ? 'timeout' : e?.message || 'fetch_failed' };
  }
}

/**
 * Lightweight reachability check (HEAD then GET if needed)
 * @param {string} slipUrl
 */
export async function checkSlipReachable(slipUrl) {
  const url = String(slipUrl || '').trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    return { ok: false, reachable: false, reason: 'invalid_url' };
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), R2_SLIP_TIMEOUT_MS);
    let res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'AQOND-PayoutReconciliation/1.0' },
    });
    clearTimeout(t);
    if (res.status === 405 || res.status === 501) {
      const ctrl2 = new AbortController();
      const t2 = setTimeout(() => ctrl2.abort(), R2_SLIP_TIMEOUT_MS);
      res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: ctrl2.signal,
        headers: { Range: 'bytes=0-0', 'User-Agent': 'AQOND-PayoutReconciliation/1.0' },
      });
      clearTimeout(t2);
    }
    if (res.ok || res.status === 206 || res.status === 200) {
      return { ok: true, reachable: true, status: res.status };
    }
    return { ok: false, reachable: false, status: res.status };
  } catch (e) {
    return { ok: false, reachable: false, reason: e?.message || 'head_failed' };
  }
}

function getSlipUrlFromBankDetails(bd) {
  if (!bd || typeof bd !== 'object') return '';
  return String(bd.slip_url || bd.slipUrl || '').trim();
}

/**
 * Run Tier A reconciliation for a single payout_requests row.
 * @param {import('pg').Pool} pool
 * @param {string} payoutId UUID string
 * @returns {Promise<{ status: 'PENDING'|'PASS'|'WARN'|'FAIL', details: object, slip_hash: string|null }>}
 */
export async function runPayoutReconciliation(pool, payoutId) {
  const idStr = String(payoutId || '').trim();
  const details = {
    R1: { rule: 'amount_match_ledger', ok: false },
    R2: { rule: 'evidence_reachable', ok: false },
    R3: { rule: 'duplicate_slip_hash', ok: true },
    R4: { rule: 'timeline_audit', ok: true },
    R5: { rule: 'slip_sha256', ok: false },
    tier: 'A',
    version: 1,
  };

  const rowQ = await pool.query(
    `SELECT id, user_id, amount, status, bank_details, created_at, processed_at
     FROM payout_requests WHERE id::text = $1 OR id = $1::uuid`,
    [idStr]
  );
  if (!rowQ.rows?.length) {
    throw new Error('payout_request_not_found');
  }
  const pr = rowQ.rows[0];
  const amount = parseFloat(pr.amount);
  const bankDetails = pr.bank_details || {};
  const slipUrl = getSlipUrlFromBankDetails(bankDetails);

  let slipHash = null;

  // R5 + R2 (content)
  if (!slipUrl) {
    details.R2 = { ...details.R2, ok: false, reason: 'missing_slip_url' };
    details.R5 = { ...details.R5, ok: false, reason: 'no_slip_to_hash' };
  } else {
    const hashed = await fetchSlipAndHash(slipUrl);
    if (hashed.ok && hashed.hash) {
      slipHash = hashed.hash;
      details.R5 = { ...details.R5, ok: true, hash_prefix: slipHash.slice(0, 12), bytes: hashed.bytes };
      details.R2 = { ...details.R2, ok: true, reachable: true, method: 'get_hash' };
    } else {
      details.R5 = { ...details.R5, ok: false, error: hashed.error || 'hash_failed' };
      const reach = await checkSlipReachable(slipUrl);
      details.R2 = {
        ...details.R2,
        ok: !!(reach.reachable && reach.ok),
        reachable: !!reach.reachable,
        note: hashed.error,
      };
    }
  }

  // R3 duplicate: same slip_hash OR same slip URL on another *settled* payout (approved + processed) — audit: no slip reuse across paid rows
  if (slipHash || slipUrl) {
    const dup = await pool.query(
      `SELECT id::text, status, processed_at, created_at
       FROM payout_requests
       WHERE id <> $1::uuid
         AND status = 'approved'
         AND processed_at IS NOT NULL
         AND (
           ($2::text IS NOT NULL AND slip_hash IS NOT NULL AND slip_hash = $2)
           OR ($3::text <> '' AND trim(COALESCE(bank_details->>'slip_url','')) = $3)
           OR ($3::text <> '' AND trim(COALESCE(bank_details->>'slipUrl','')) = $3)
         )
       ORDER BY processed_at ASC
       LIMIT 5`,
      [pr.id, slipHash || null, slipUrl || '']
    );
    const others = dup.rows || [];
    if (others.length > 0) {
      details.R3 = {
        ...details.R3,
        ok: false,
        conflict_ids: others.map((r) => r.id),
        reason: 'duplicate_slip_on_settled_payout',
      };
    } else {
      details.R3 = { ...details.R3, ok: true };
    }
  } else {
    details.R3 = { ...details.R3, ok: true, skipped: true, reason: 'no_slip_evidence' };
  }

  // R1 ledger amount (only meaningful after approval / ledger posted)
  if (pr.status === 'approved' && pr.processed_at) {
    const ledgerQ = await pool.query(
      `SELECT id, amount::float AS amount, created_at
       FROM payment_ledger_audit
       WHERE event_type = 'user_payout_withdrawal'
         AND (
           payment_id::text = $1
           OR payment_id::text = $2
           OR (metadata->>'payout_request_id') = $1
           OR (metadata->>'payout_request_id') = $2
         )
       ORDER BY created_at DESC
       LIMIT 3`,
      [idStr, String(pr.id)]
    );
    const led = ledgerQ.rows?.[0];
    if (led) {
      const lamt = parseFloat(led.amount);
      const match = Math.abs(lamt - amount) < AMOUNT_EPS;
      details.R1 = {
        ...details.R1,
        ok: match,
        ledger_amount: lamt,
        payout_amount: amount,
        ledger_id: led.id,
      };
      if (!match) {
        details.R1.delta = Math.round((lamt - amount) * 100) / 100;
      }
    } else {
      details.R1 = {
        ...details.R1,
        ok: false,
        reason: 'ledger_row_not_found_after_approval',
        payout_amount: amount,
      };
    }
  } else {
    details.R1 = {
      ...details.R1,
      ok: true,
      skipped: true,
      reason: pr.status === 'pending' ? 'pending_no_ledger_yet' : 'no_ledger_context',
      payout_amount: amount,
    };
  }

  // R4 timeline: created < processed (paid) when settled
  const created = pr.created_at ? new Date(pr.created_at).getTime() : null;
  const processed = pr.processed_at ? new Date(pr.processed_at).getTime() : null;
  if (pr.status === 'approved' && processed != null && created != null) {
    const okOrder = created < processed;
    details.R4 = {
      ...details.R4,
      ok: okOrder,
      created_at: pr.created_at,
      paid_at: pr.processed_at,
      note: okOrder ? 'created_before_settlement' : 'timeline_inversion',
    };
    if (!okOrder) details.R4.severity = 'fail';
  } else if (pr.status === 'pending') {
    details.R4 = {
      ...details.R4,
      ok: true,
      note: 'awaiting_approval',
    };
  } else {
    details.R4 = { ...details.R4, ok: true, note: 'no_processed_at', status: pr.status };
  }

  // Aggregate status — FAIL blocks auto-payout; WARN = manual review suggested
  let status = 'PASS';
  const fails = [];
  const warns = [];

  if (details.R1.ok === false && !details.R1.skipped) fails.push('R1');
  if (details.R2.ok === false) fails.push('R2');
  if (details.R3.ok === false) fails.push('R3');
  if (details.R4.ok === false || details.R4.severity === 'fail') fails.push('R4');
  if (details.R5.ok === false) fails.push('R5');

  if (details.R1.skipped && pr.status === 'approved' && pr.processed_at) {
    warns.push('R1_skipped_unexpected');
  }
  if (details.R3.skipped) warns.push('R3_no_slip');

  if (fails.length) status = 'FAIL';
  else if (warns.length) status = 'WARN';
  else status = 'PASS';

  details.summary = { fails, warns, evaluated_at: new Date().toISOString() };

  await pool.query(
    `UPDATE payout_requests
     SET reconciliation_status = $2,
         reconciliation_details = $3::jsonb,
         slip_hash = COALESCE($4, slip_hash),
         reconciled_at = NOW()
     WHERE id = $1::uuid`,
    [pr.id, status, JSON.stringify(details), slipHash]
  );

  return { status, details, slip_hash: slipHash };
}

/**
 * Append-only audit log for manual reconcile / SuperAdmin overrides (migration 156).
 * @param {import('pg').Pool} pool
 * @param {object} row
 */
export async function insertPayoutReconciliationAuditLog(pool, row) {
  await pool.query(
    `INSERT INTO payout_reconciliation_audit_log (
       payout_request_id, actor_admin_id, actor_role, action,
       old_reconciliation_status, new_reconciliation_status,
       reason, ip_address, metadata
     ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
    [
      row.payout_request_id,
      row.actor_admin_id,
      row.actor_role || null,
      row.action,
      row.old_reconciliation_status ?? null,
      row.new_reconciliation_status ?? null,
      row.reason,
      row.ip_address || null,
      JSON.stringify(row.metadata || {}),
    ]
  );
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ date?: string }} opts date YYYY-MM-DD = calendar day in Asia/Bangkok (ICT)
 */
export async function buildReconciliationSummary(pool, opts = {}) {
  const dateStr = (opts.date || new Date().toISOString().slice(0, 10)).slice(0, 10);

  const [vol, exc, report] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS total
       FROM payout_requests
       WHERE reconciliation_status = 'PASS'
         AND (timezone('Asia/Bangkok', COALESCE(reconciled_at, created_at)))::date = $1::date`,
      [dateStr]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS c
       FROM payout_requests
       WHERE status = 'pending'
         AND COALESCE(reconciliation_status, '') IN ('FAIL', 'WARN')
         AND (timezone('Asia/Bangkok', created_at))::date = $1::date`,
      [dateStr]
    ),
    buildDailyReconciliationReportData(pool, { date: dateStr }),
  ]);

  const pendingExceptions = parseInt(exc.rows?.[0]?.c ?? 0, 10) || 0;
  const totalVolume = parseFloat(vol.rows?.[0]?.total || 0);

  return {
    report_date: dateStr,
    timezone: REPORT_TIMEZONE_LABEL,
    total_volume_reconciled_pass_thb: Math.round(totalVolume * 100) / 100,
    pending_exceptions: pendingExceptions,
    ledger_variance_thb: report.totals.delta_thb,
    /** Stable dashboard id for the Bangkok calendar day (export reports use a unique Report ID per download) */
    report_id: `AQOND-SUM-${dateStr.replace(/-/g, '')}`,
  };
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ date?: string }} opts date YYYY-MM-DD = calendar day in Asia/Bangkok (ICT)
 */
export async function buildDailyReconciliationReportData(pool, opts = {}) {
  const dateStr = (opts.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const reportId = `AQOND-RPT-${dateStr.replace(/-/g, '')}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const generatedAt = new Date();

  const payouts = await pool.query(
    `SELECT p.id, p.user_id, p.amount, p.status, p.bank_details, p.reconciliation_status,
            p.reconciliation_details, p.slip_hash, p.created_at, p.processed_at,
            to_char(timezone('Asia/Bangkok', p.created_at), 'YYYY-MM-DD HH24:MI:SS') AS created_at_bangkok,
            to_char(timezone('Asia/Bangkok', p.processed_at), 'YYYY-MM-DD HH24:MI:SS') AS processed_at_bangkok
     FROM payout_requests p
     WHERE (timezone('Asia/Bangkok', p.created_at))::date = $1::date
     ORDER BY p.created_at ASC`,
    [dateStr]
  );

  const ledgerSum = await pool.query(
    `SELECT COALESCE(SUM(amount), 0)::numeric AS total
     FROM payment_ledger_audit
     WHERE event_type = 'user_payout_withdrawal'
       AND (timezone('Asia/Bangkok', created_at))::date = $1::date`,
    [dateStr]
  );

  const payoutTotal = (payouts.rows || []).reduce((s, r) => s + parseFloat(r.amount || 0), 0);
  const ledgerTotal = parseFloat(ledgerSum.rows?.[0]?.total || 0);

  return {
    report_id: reportId,
    report_date: dateStr,
    report_timezone: REPORT_TIMEZONE_LABEL,
    generated_at: generatedAt.toISOString(),
    generated_at_display: `${generatedAt.toISOString()} (UTC) · ${generatedAt.toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' })} (Asia/Bangkok ICT)`,
    totals: {
      payout_requests_count: payouts.rows?.length || 0,
      payout_amount_sum_thb: Math.round(payoutTotal * 100) / 100,
      ledger_withdrawal_sum_thb: Math.round(ledgerTotal * 100) / 100,
      delta_thb: Math.round((payoutTotal - ledgerTotal) * 100) / 100,
      note:
        'Report date = calendar day in Asia/Bangkok (ICT, UTC+7). Payout and ledger rows are filtered by that local date. Row timestamps below include UTC ISO and Bangkok local.',
    },
    rows: (payouts.rows || []).map((r) => ({
      request_id: String(r.id),
      user_id: String(r.user_id),
      amount_thb: parseFloat(r.amount),
      status: r.status,
      reconciliation_status: r.reconciliation_status,
      slip_hash: r.slip_hash || null,
      rule_flags: summarizeRules(r.reconciliation_details),
      created_at: r.created_at ? new Date(r.created_at).toISOString() : null,
      created_at_bangkok: r.created_at_bangkok || null,
      processed_at: r.processed_at ? new Date(r.processed_at).toISOString() : null,
      processed_at_bangkok: r.processed_at_bangkok || null,
    })),
  };
}

function summarizeRules(detailsJson) {
  if (!detailsJson) return '';
  let d = detailsJson;
  if (typeof detailsJson === 'string') {
    try {
      d = JSON.parse(detailsJson);
    } catch {
      return '';
    }
  }
  if (typeof d !== 'object' || !d) return '';
  const parts = ['R1', 'R2', 'R3', 'R4', 'R5'].map((k) => {
    const x = d[k];
    if (!x) return `${k}:?`;
    if (x.skipped) return `${k}:skip`;
    return `${k}:${x.ok ? 'ok' : 'fail'}`;
  });
  return parts.join('|');
}

/**
 * CSV for audit export (UTF-8 BOM for Excel Thai)
 */
export function dailyReportToCsv(data) {
  const BOM = '\uFEFF';
  const lines = [];
  lines.push('AQOND Daily Payout Reconciliation Report');
  lines.push(`Report ID,${data.report_id || ''}`);
  lines.push(`Report Date (Asia/Bangkok calendar day — ICT / UTC+7),${data.report_date}`);
  lines.push(`Timezone,${data.report_timezone || REPORT_TIMEZONE_LABEL}`);
  lines.push(`Generated At (UTC + Bangkok),${data.generated_at_display || data.generated_at}`);
  lines.push(`Payout Requests Count,${data.totals.payout_requests_count}`);
  lines.push(`Sum Payout Amounts (THB),${data.totals.payout_amount_sum_thb}`);
  lines.push(`Sum Ledger user_payout_withdrawal (THB),${data.totals.ledger_withdrawal_sum_thb}`);
  lines.push(`Ledger Variance / Delta (THB),${data.totals.delta_thb}`);
  lines.push(`Notes,${String(data.totals.note || '').replace(/"/g, '""')}`);
  lines.push('');
  lines.push(
    'request_id,user_id,amount_thb,status,reconciliation_status,slip_sha256,rule_flags,created_at_utc,created_at_bangkok_ict,processed_at_utc,processed_at_bangkok_ict'
  );
  for (const r of data.rows || []) {
    const row = [
      r.request_id,
      r.user_id,
      r.amount_thb,
      r.status,
      r.reconciliation_status,
      r.slip_hash || '',
      r.rule_flags,
      r.created_at || '',
      r.created_at_bangkok || '',
      r.processed_at || '',
      r.processed_at_bangkok || '',
    ].map((c) => `"${String(c).replace(/"/g, '""')}"`);
    lines.push(row.join(','));
  }
  return BOM + lines.join('\r\n');
}

/**
 * Simple PDF for audit package (UTF-8; embed font default Helvetica — ASCII-safe labels).
 */
export function buildDailyReconciliationPdfBuffer(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(8).text('[ AQOND Official Logo — placeholder for embedded brand asset ]');
    doc.fontSize(14).text('AQOND — Daily Payout Reconciliation Report', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(9).text(`Report ID: ${data.report_id || '—'}`);
    doc.text(`Report date (Asia/Bangkok / ICT, UTC+7): ${data.report_date}`);
    doc.text(`Timezone: ${data.report_timezone || REPORT_TIMEZONE_LABEL}`);
    doc.text(`Generated: ${data.generated_at_display || data.generated_at}`);
    doc.moveDown();
    doc.fontSize(10).text('Summary', { underline: true });
    doc.fontSize(9).text(`Payout requests count: ${data.totals.payout_requests_count}`);
    doc.text(`Sum payout amounts (THB): ${data.totals.payout_amount_sum_thb}`);
    doc.text(`Ledger user_payout_withdrawal sum (THB): ${data.totals.ledger_withdrawal_sum_thb}`);
    doc.text(`Ledger variance / Delta (THB): ${data.totals.delta_thb}`);
    doc.text(String(data.totals.note || ''));
    doc.moveDown();
    doc.fontSize(9).text('Reviewer attestation (sign below after review)', { underline: true });
    doc.moveDown(0.3);
    doc.text('Digital / wet signature placeholder: _________________________________   Date: ______________');
    doc.moveDown(1.2);
    doc.fontSize(10).text('Line items', { underline: true });
    doc.moveDown(0.3);
    (data.rows || []).forEach((r, i) => {
      if (i > 0 && i % 35 === 0) doc.addPage();
      const hashShort = (r.slip_hash || '').slice(0, 16);
      const line = `${r.request_id} | amt ${r.amount_thb} | ${r.status} | rec ${r.reconciliation_status} | SHA-256 ${hashShort}…`;
      doc.fontSize(7.5).text(line, { width: 520 });
    });
    doc.end();
  });
}
