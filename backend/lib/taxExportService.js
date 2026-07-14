import crypto from 'crypto';

const CSV_BOM = '\uFEFF';

function round2(value) {
  const n = Number(value || 0);
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function parseMonthYear({ month, year } = {}) {
  const now = new Date();
  const m = Math.min(Math.max(parseInt(String(month || now.getMonth() + 1), 10) || now.getMonth() + 1, 1), 12);
  const y = Math.min(Math.max(parseInt(String(year || now.getFullYear()), 10) || now.getFullYear(), 2000), 2100);
  const fromDate = `${y}-${String(m).padStart(2, '0')}-01`;
  const nextMonth = m === 12 ? 1 : m + 1;
  const nextYear = m === 12 ? y + 1 : y;
  const toDateExclusive = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
  return { month: m, year: y, fromDate, toDateExclusive };
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const s = value instanceof Date ? value.toISOString() : String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers, rows) {
  const header = headers.join(',');
  const body = (rows || []).map((row) => headers.map((h) => csvEscape(row[h])).join(',')).join('\n');
  return `${header}${body ? `\n${body}` : ''}`;
}

function sumRows(rows, fields) {
  return (rows || []).reduce((acc, row) => {
    for (const field of fields) acc[field] = round2((acc[field] || 0) + Number(row[field] || 0));
    return acc;
  }, {});
}

function buildReport({ reportType, generatedBy, period, headers, rows, totals = {}, extra = {} }) {
  const csv = toCsv(headers, rows);
  const meta = {
    report_type: reportType,
    generated_by: generatedBy || 'admin',
    generated_at: new Date().toISOString(),
    filters: { month: period.month, year: period.year, from_date: period.fromDate, to_date_exclusive: period.toDateExclusive },
    row_count: rows.length,
    totals,
    checksum_sha256: sha256(JSON.stringify({ reportType, filters: period, headers, rows, totals })),
    csv_checksum_sha256: sha256(CSV_BOM + csv),
    ...extra,
  };
  return { meta, headers, rows, csv };
}

function monthWhere(alias = 'created_at') {
  return `((${alias} AT TIME ZONE 'Asia/Bangkok')::date >= $1::date AND (${alias} AT TIME ZONE 'Asia/Bangkok')::date < $2::date)`;
}

const PLATFORM_REVENUE_SOURCE_MAPPING = Object.freeze({
  match_job_commission: "payment_ledger_audit.event_type = 'escrow_held' AND metadata.leg = 'commission' for jobs",
  booking_fee: "payment_ledger_audit.event_type = 'booking_fee'",
  advance_job_commission: "payment_ledger_audit.event_type = 'escrow_held' AND metadata.leg = 'commission' for advance_jobs",
  wallet_deposit_margin: "payment_ledger_audit.event_type = 'wallet_deposit' platform_margin_amount only",
  withdrawal_fee_margin: "payment_ledger_audit.event_type IN ('user_payout_withdrawal','withdrawal_fee_income') platform fee/margin only",
  other_platform_fee: "legacy platform fee products such as post_job_fee, vip_subscription, branding_package_payout",
});

const PLATFORM_REVENUE_CANONICAL_DECISION = 'payment_ledger_audit commission/fee rows are canonical for platform revenue reconciliation; platform_revenues is supplementary until sensitive payment flows explicitly write matching rows.';

async function buildVatSalesReport(client, period, generatedBy) {
  const result = await client.query(
    `SELECT
       fd.id AS document_id,
       fd.document_no,
       fd.document_type,
       fd.status,
       fd.party_role,
       fd.source_event_id,
       fd.source_event_type,
       fd.source_payment_id,
       fd.source_job_id,
       fd.source_payout_id,
       fd.source_charge_id,
       fd.issued_at,
       fd.created_at,
       COALESCE(fd.buyer_snapshot->>'legal_name', '') AS buyer_legal_name,
       COALESCE(fd.buyer_snapshot->>'tax_id', '') AS buyer_tax_id,
       COALESCE(fd.buyer_snapshot->>'branch_code', '') AS buyer_branch_code,
       fdl.line_no,
       fdl.description,
       fdl.taxable_amount,
       fdl.vat_rate_percent,
       fdl.vat_amount,
       fdl.wht_amount,
       fdl.total_amount,
       COALESCE(fdl.metadata->>'taxable_revenue_type', '') AS taxable_revenue_type
     FROM fiscal_documents fd
     JOIN fiscal_document_lines fdl ON fdl.document_id = fd.id
     WHERE fd.document_type IN ('tax_invoice', 'credit_note')
       AND fd.status IN ('issued', 'exported', 'credit_note_issued')
       AND ${monthWhere('COALESCE(fd.issued_at, fd.created_at)')}
     ORDER BY COALESCE(fd.issued_at, fd.created_at), fd.document_no NULLS LAST, fdl.line_no`,
    [period.fromDate, period.toDateExclusive],
  );
  const rows = (result.rows || []).map((r) => ({
    document_id: String(r.document_id),
    document_no: r.document_no || '',
    document_type: r.document_type,
    status: r.status,
    issued_at: r.issued_at ? new Date(r.issued_at).toISOString() : '',
    created_at: r.created_at ? new Date(r.created_at).toISOString() : '',
    party_role: r.party_role,
    buyer_legal_name: r.buyer_legal_name || '',
    buyer_tax_id: r.buyer_tax_id || '',
    buyer_branch_code: r.buyer_branch_code || '',
    source_event_id: r.source_event_id || '',
    source_event_type: r.source_event_type || '',
    source_payment_id: r.source_payment_id || '',
    source_job_id: r.source_job_id || '',
    source_payout_id: r.source_payout_id || '',
    source_charge_id: r.source_charge_id || '',
    line_no: Number(r.line_no || 0),
    description: r.description || '',
    taxable_revenue_type: r.taxable_revenue_type || '',
    taxable_amount: round2(r.taxable_amount),
    vat_rate_percent: Number(r.vat_rate_percent || 0),
    vat_amount: round2(r.vat_amount),
    wht_amount: round2(r.wht_amount),
    total_amount: round2(r.total_amount),
  }));
  const headers = ['document_id', 'document_no', 'document_type', 'status', 'issued_at', 'created_at', 'party_role', 'buyer_legal_name', 'buyer_tax_id', 'buyer_branch_code', 'source_event_id', 'source_event_type', 'source_payment_id', 'source_job_id', 'source_payout_id', 'source_charge_id', 'line_no', 'description', 'taxable_revenue_type', 'taxable_amount', 'vat_rate_percent', 'vat_amount', 'wht_amount', 'total_amount'];
  return buildReport({ reportType: 'vat-sales', generatedBy, period, headers, rows, totals: sumRows(rows, ['taxable_amount', 'vat_amount', 'wht_amount', 'total_amount']) });
}

async function buildWhtReport(client, period, generatedBy) {
  const result = await client.query(
    `SELECT
       tw.id,
       tw.source_event_id,
       tw.source_event_type,
       tw.source_payment_id,
       tw.source_job_id,
       tw.source_booking_id,
       tw.source_milestone_id,
       tw.provider_user_id,
       COALESCE(tw.tax_profile_snapshot->>'legal_name', u.full_name, '') AS provider_legal_name,
       COALESCE(tw.tax_profile_snapshot->>'tax_id', '') AS provider_tax_id,
       COALESCE(tw.tax_profile_snapshot->>'tax_entity_type', '') AS provider_tax_entity_type,
       tw.gross_income_amount,
       tw.wht_rate_percent,
       tw.withheld_amount,
       tw.net_payable_amount,
       tw.eligibility_status,
       tw.eligibility_reason,
       tw.earning_document_id,
       tw.wht_certificate_document_id,
       ed.document_no AS earning_document_no,
       wd.document_no AS wht_certificate_document_no,
       tw.created_at
     FROM tax_withholding_postings tw
     LEFT JOIN users u ON u.id = tw.provider_user_id
     LEFT JOIN fiscal_documents ed ON ed.id = tw.earning_document_id
     LEFT JOIN fiscal_documents wd ON wd.id = tw.wht_certificate_document_id
     WHERE ${monthWhere('tw.created_at')}
     ORDER BY tw.created_at ASC`,
    [period.fromDate, period.toDateExclusive],
  );
  const rows = (result.rows || []).map((r) => ({
    posting_id: String(r.id),
    source_event_id: r.source_event_id || '',
    source_event_type: r.source_event_type || '',
    source_payment_id: r.source_payment_id || '',
    source_job_id: r.source_job_id || '',
    source_booking_id: r.source_booking_id || '',
    source_milestone_id: r.source_milestone_id || '',
    provider_user_id: String(r.provider_user_id || ''),
    provider_legal_name: r.provider_legal_name || '',
    provider_tax_id: r.provider_tax_id || '',
    provider_tax_entity_type: r.provider_tax_entity_type || '',
    gross_income_amount: round2(r.gross_income_amount),
    wht_rate_percent: Number(r.wht_rate_percent || 0),
    withheld_amount: round2(r.withheld_amount),
    net_payable_amount: round2(r.net_payable_amount),
    eligibility_status: r.eligibility_status || '',
    eligibility_reason: r.eligibility_reason || '',
    earning_document_id: r.earning_document_id || '',
    earning_document_no: r.earning_document_no || '',
    wht_certificate_document_id: r.wht_certificate_document_id || '',
    wht_certificate_document_no: r.wht_certificate_document_no || '',
    created_at: r.created_at ? new Date(r.created_at).toISOString() : '',
  }));
  const headers = ['posting_id', 'source_event_id', 'source_event_type', 'source_payment_id', 'source_job_id', 'source_booking_id', 'source_milestone_id', 'provider_user_id', 'provider_legal_name', 'provider_tax_id', 'provider_tax_entity_type', 'gross_income_amount', 'wht_rate_percent', 'withheld_amount', 'net_payable_amount', 'eligibility_status', 'eligibility_reason', 'earning_document_id', 'earning_document_no', 'wht_certificate_document_id', 'wht_certificate_document_no', 'created_at'];
  return buildReport({ reportType: 'wht', generatedBy, period, headers, rows, totals: sumRows(rows, ['gross_income_amount', 'withheld_amount', 'net_payable_amount']) });
}

async function buildPlatformRevenueReport(client, period, generatedBy) {
  const result = await client.query(
    `SELECT id, transaction_id, source_type, amount, gross_amount, gateway_fee_amount, created_at
     FROM platform_revenues
     WHERE ${monthWhere('created_at')}
     ORDER BY created_at ASC`,
    [period.fromDate, period.toDateExclusive],
  );
  const rows = (result.rows || []).map((r) => ({
    id: String(r.id),
    transaction_id: r.transaction_id || '',
    source_type: r.source_type || '',
    amount: round2(r.amount),
    gross_amount: round2(r.gross_amount),
    gateway_fee_amount: round2(r.gateway_fee_amount),
    created_at: r.created_at ? new Date(r.created_at).toISOString() : '',
  }));
  const bySource = rows.reduce((acc, r) => {
    acc[r.source_type] = round2((acc[r.source_type] || 0) + Number(r.amount || 0));
    return acc;
  }, {});
  const headers = ['id', 'transaction_id', 'source_type', 'amount', 'gross_amount', 'gateway_fee_amount', 'created_at'];
  return buildReport({ reportType: 'platform-revenue', generatedBy, period, headers, rows, totals: { ...sumRows(rows, ['amount', 'gross_amount', 'gateway_fee_amount']), by_source_type: bySource } });
}

async function buildProviderIncomeReport(client, period, generatedBy) {
  const result = await client.query(
    `SELECT id, event_type, payment_id, job_id, amount, net_amount, provider_id, bill_no, transaction_no, metadata, created_at
     FROM payment_ledger_audit
     WHERE provider_id IS NOT NULL
       AND event_type IN ('escrow_held', 'escrow_released', 'talent_booking_payout', 'wallet_tip', 'coach_training_fee')
       AND (event_type <> 'escrow_held' OR metadata->>'leg' = 'provider_net')
       AND ${monthWhere('created_at')}
     ORDER BY created_at ASC`,
    [period.fromDate, period.toDateExclusive],
  );
  const rows = (result.rows || []).map((r) => ({
    ledger_id: r.id,
    event_type: r.event_type,
    payment_id: r.payment_id || '',
    job_id: r.job_id || '',
    provider_id: r.provider_id || '',
    amount: round2(r.amount),
    net_amount: r.net_amount != null ? round2(r.net_amount) : round2(r.amount),
    bill_no: r.bill_no || '',
    transaction_no: r.transaction_no || '',
    metadata_leg: r.metadata?.leg || '',
    metadata_source: r.metadata?.source || '',
    created_at: r.created_at ? new Date(r.created_at).toISOString() : '',
  }));
  const headers = ['ledger_id', 'event_type', 'payment_id', 'job_id', 'provider_id', 'amount', 'net_amount', 'bill_no', 'transaction_no', 'metadata_leg', 'metadata_source', 'created_at'];
  return buildReport({ reportType: 'provider-income', generatedBy, period, headers, rows, totals: sumRows(rows, ['amount', 'net_amount']) });
}

async function buildWalletFlowReport(client, period, generatedBy) {
  const result = await client.query(
    `SELECT id, event_type, payment_id, gateway, job_id, amount, net_amount, gateway_fee_amount, platform_margin_amount, user_id, provider_id, bill_no, transaction_no, created_at
     FROM payment_ledger_audit
     WHERE event_type IN ('wallet_deposit', 'user_payout_withdrawal')
       AND ${monthWhere('created_at')}
     ORDER BY created_at ASC`,
    [period.fromDate, period.toDateExclusive],
  );
  const rows = (result.rows || []).map((r) => ({
    ledger_id: r.id,
    event_type: r.event_type,
    payment_id: r.payment_id || '',
    gateway: r.gateway || '',
    job_id: r.job_id || '',
    amount: round2(r.amount),
    net_amount: r.net_amount != null ? round2(r.net_amount) : '',
    gateway_fee_amount: r.gateway_fee_amount != null ? round2(r.gateway_fee_amount) : '',
    platform_margin_amount: r.platform_margin_amount != null ? round2(r.platform_margin_amount) : '',
    user_id: r.user_id || '',
    provider_id: r.provider_id || '',
    bill_no: r.bill_no || '',
    transaction_no: r.transaction_no || '',
    created_at: r.created_at ? new Date(r.created_at).toISOString() : '',
  }));
  const headers = ['ledger_id', 'event_type', 'payment_id', 'gateway', 'job_id', 'amount', 'net_amount', 'gateway_fee_amount', 'platform_margin_amount', 'user_id', 'provider_id', 'bill_no', 'transaction_no', 'created_at'];
  return buildReport({ reportType: 'wallet-flows', generatedBy, period, headers, rows, totals: sumRows(rows, ['amount']) });
}

async function buildReconciliation(client, period) {
  const params = [period.fromDate, period.toDateExclusive];
  const [docVsLedger, vat, wht, platformRevenue, platformFeeLedger, voidedCredit] = await Promise.all([
    client.query(
      `SELECT
         COALESCE(SUM(fd.total_amount),0) AS fiscal_total,
         COALESCE(SUM(pla.amount),0) AS ledger_total,
         COUNT(fd.id)::int AS document_count,
         COUNT(pla.id)::int AS matched_ledger_count
       FROM fiscal_documents fd
       LEFT JOIN payment_ledger_audit pla ON pla.id = fd.source_event_id
       WHERE fd.status IN ('issued','exported','credit_note_issued')
         AND ${monthWhere('COALESCE(fd.issued_at, fd.created_at)')}`,
      params,
    ).catch(() => ({ rows: [{}] })),
    client.query(
      `SELECT
         COALESCE(SUM(fd.vat_amount),0) AS document_vat_total,
         COALESCE(SUM(line_totals.vat_amount),0) AS line_vat_total,
         COALESCE(SUM(fd.subtotal_amount),0) AS document_taxable_total,
         COALESCE(SUM(line_totals.taxable_amount),0) AS line_taxable_total
       FROM fiscal_documents fd
       LEFT JOIN (
         SELECT document_id, SUM(vat_amount) AS vat_amount, SUM(taxable_amount) AS taxable_amount
         FROM fiscal_document_lines GROUP BY document_id
       ) line_totals ON line_totals.document_id = fd.id
       WHERE fd.status IN ('issued','exported','credit_note_issued')
         AND ${monthWhere('COALESCE(fd.issued_at, fd.created_at)')}`,
      params,
    ).catch(() => ({ rows: [{}] })),
    client.query(
      `SELECT
         COALESCE(SUM(tw.withheld_amount),0) AS posting_withheld_total,
         COALESCE((SELECT SUM(amount) FROM payment_ledger_audit pla WHERE pla.event_type = 'provider_wht_withheld' AND ${monthWhere('pla.created_at')}),0) AS ledger_withheld_total,
         COUNT(tw.id)::int AS posting_count
       FROM tax_withholding_postings tw
       WHERE ${monthWhere('tw.created_at')}`,
      params,
    ).catch(() => ({ rows: [{}] })),
    client.query(
      `WITH source_totals AS (
         SELECT source_type, SUM(amount) AS amount
              , COUNT(*)::int AS row_count
         FROM platform_revenues
         WHERE ${monthWhere('created_at')}
         GROUP BY source_type
       )
       SELECT
         COALESCE(SUM(amount),0) AS platform_revenues_total,
         COALESCE(SUM(row_count),0)::int AS platform_revenue_count,
         COALESCE(jsonb_object_agg(source_type, amount) FILTER (WHERE source_type IS NOT NULL), '{}'::jsonb) AS by_source_type
       FROM source_totals`,
      params,
    ).catch(() => ({ rows: [{}] })),
    client.query(
      `WITH taxable_platform_document_source_rows AS (
         SELECT
           COALESCE(
             NULLIF(fdl.metadata->>'platform_revenue_source', ''),
             CASE
               WHEN fdl.metadata->>'wallet_component' = 'platform_margin_service_fee' THEN 'wallet_deposit_margin'
               WHEN fdl.metadata->>'wallet_component' IN ('withdrawal_platform_fee_margin', 'withdrawal_fee_margin') THEN 'withdrawal_fee_margin'
               WHEN fdl.metadata->>'component' = 'platform_booking_markup' THEN 'booking_fee'
               WHEN fdl.metadata->>'component' = 'platform_service_fee'
                    AND EXISTS (SELECT 1 FROM advance_jobs aj WHERE aj.id::text = fd.source_job_id::text) THEN 'advance_job_commission'
               WHEN fdl.metadata->>'component' = 'platform_service_fee' THEN 'match_job_commission'
               WHEN fd.source_event_type = 'user_payout_withdrawal' THEN 'withdrawal_fee_margin'
               WHEN fd.source_event_type = 'wallet_deposit' THEN 'wallet_deposit_margin'
               WHEN fd.source_event_type = 'provider_wht_withheld' THEN 'other_platform_fee'
               ELSE 'other_platform_fee'
             END
           ) AS source_type,
           fdl.total_amount,
           fdl.taxable_amount,
           fdl.vat_amount
         FROM fiscal_document_lines fdl
         JOIN fiscal_documents fd ON fd.id = fdl.document_id
         WHERE fdl.metadata->>'taxable_revenue_type' = 'platform_fee'
           AND fd.status IN ('issued','exported','credit_note_issued')
           AND ${monthWhere('COALESCE(fd.issued_at, fd.created_at)')}
       ),
       taxable_platform_document_lines AS (
         SELECT
           COALESCE(SUM(total_amount),0) AS total_amount,
           COALESCE(SUM(taxable_amount),0) AS taxable_amount,
           COALESCE(SUM(vat_amount),0) AS vat_amount,
           COUNT(*)::int AS line_count
         FROM taxable_platform_document_source_rows
       ),
       taxable_platform_document_sources AS (
         SELECT source_type, SUM(total_amount) AS total_amount, COUNT(*)::int AS line_count
         FROM taxable_platform_document_source_rows
         GROUP BY source_type
       ),
       commission_or_fee_ledger_source_rows AS (
         SELECT
           CASE
             WHEN pla.event_type = 'wallet_deposit' THEN 'wallet_deposit_margin'
             WHEN pla.event_type IN ('user_payout_withdrawal', 'withdrawal_fee_income') THEN 'withdrawal_fee_margin'
             WHEN pla.event_type = 'booking_fee' THEN 'booking_fee'
             WHEN pla.event_type = 'escrow_held' AND pla.metadata->>'leg' = 'commission'
                  AND EXISTS (SELECT 1 FROM advance_jobs aj WHERE aj.id::text = pla.job_id::text) THEN 'advance_job_commission'
             WHEN pla.event_type = 'escrow_held' AND pla.metadata->>'leg' = 'commission' THEN 'match_job_commission'
             WHEN pla.event_type IN ('post_job_fee', 'vip_subscription', 'branding_package_payout') THEN 'other_platform_fee'
             ELSE NULL
           END AS source_type,
           CASE
             WHEN pla.event_type = 'wallet_deposit' THEN COALESCE(pla.platform_margin_amount, NULLIF(pla.metadata->>'platform_margin_amount','')::numeric, 0)
             WHEN pla.event_type = 'user_payout_withdrawal' THEN COALESCE(pla.platform_margin_amount, NULLIF(pla.metadata->>'platform_margin_amount','')::numeric, 0)
             WHEN pla.event_type IN ('withdrawal_fee_income', 'post_job_fee', 'vip_subscription', 'branding_package_payout') THEN pla.amount
             WHEN pla.event_type = 'booking_fee' THEN pla.amount
             WHEN pla.event_type = 'escrow_held' AND pla.metadata->>'leg' = 'commission' THEN pla.amount
             ELSE 0
           END AS amount
         FROM payment_ledger_audit pla
         WHERE ${monthWhere('created_at')}
       ),
       commission_or_fee_ledger_rows AS (
         SELECT
           COALESCE(SUM(amount),0) AS total_amount,
           COUNT(*) FILTER (WHERE source_type IS NOT NULL AND amount <> 0)::int AS ledger_row_count
         FROM commission_or_fee_ledger_source_rows
         WHERE source_type IS NOT NULL
       ),
       commission_or_fee_ledger_sources AS (
         SELECT source_type, SUM(amount) AS total_amount, COUNT(*)::int AS ledger_row_count
         FROM commission_or_fee_ledger_source_rows
         WHERE source_type IS NOT NULL AND amount <> 0
         GROUP BY source_type
       )
       SELECT
         d.total_amount AS document_platform_fee_total,
         d.taxable_amount AS document_platform_taxable_total,
         d.vat_amount AS document_platform_vat_total,
         d.line_count AS document_platform_line_count,
         l.total_amount AS platform_fee_ledger_total,
         l.ledger_row_count AS platform_fee_ledger_row_count,
         COALESCE((SELECT jsonb_object_agg(source_type, total_amount) FROM taxable_platform_document_sources), '{}'::jsonb) AS document_by_source_type,
         COALESCE((SELECT jsonb_object_agg(source_type, total_amount) FROM commission_or_fee_ledger_sources), '{}'::jsonb) AS ledger_by_source_type
       FROM taxable_platform_document_lines d
       CROSS JOIN commission_or_fee_ledger_rows l`,
      params,
    ).catch(() => ({ rows: [{}] })),
    client.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'voided')::int AS voided_count,
         COALESCE(SUM(total_amount) FILTER (WHERE status = 'voided'),0) AS voided_total,
         COUNT(*) FILTER (WHERE document_type = 'credit_note')::int AS credit_note_count,
         COALESCE(SUM(total_amount) FILTER (WHERE document_type = 'credit_note'),0) AS credit_note_total
       FROM fiscal_documents
       WHERE ${monthWhere('COALESCE(issued_at, created_at)')}`,
      params,
    ).catch(() => ({ rows: [{}] })),
  ]);
  const d = docVsLedger.rows?.[0] || {};
  const v = vat.rows?.[0] || {};
  const w = wht.rows?.[0] || {};
  const p = platformRevenue.rows?.[0] || {};
  const pfl = platformFeeLedger.rows?.[0] || {};
  const vc = voidedCredit.rows?.[0] || {};
  const documentPlatformFeeTotal = round2(pfl.document_platform_fee_total);
  const platformRevenuesTotal = round2(p.platform_revenues_total);
  const platformFeeLedgerTotal = round2(pfl.platform_fee_ledger_total);
  const out = {
    fiscal_document_totals_vs_payment_ledger: {
      comparison_scope: 'legacy_header_total_to_source_ledger_amount',
      warning: 'Informational only. Do not use this direct comparison for platform/service-fee documents because source ledger amount may include principal/top-up/escrow gross.',
      fiscal_total: round2(d.fiscal_total),
      ledger_total: round2(d.ledger_total),
      variance: round2(Number(d.fiscal_total || 0) - Number(d.ledger_total || 0)),
      document_count: Number(d.document_count || 0),
      matched_ledger_count: Number(d.matched_ledger_count || 0),
    },
    vat_totals_vs_taxable_document_lines: {
      document_vat_total: round2(v.document_vat_total),
      line_vat_total: round2(v.line_vat_total),
      vat_variance: round2(Number(v.document_vat_total || 0) - Number(v.line_vat_total || 0)),
      document_taxable_total: round2(v.document_taxable_total),
      line_taxable_total: round2(v.line_taxable_total),
      taxable_variance: round2(Number(v.document_taxable_total || 0) - Number(v.line_taxable_total || 0)),
    },
    taxable_platform_document_lines: {
      total_amount: documentPlatformFeeTotal,
      taxable_amount: round2(pfl.document_platform_taxable_total),
      vat_amount: round2(pfl.document_platform_vat_total),
      line_count: Number(pfl.document_platform_line_count || 0),
      by_source_type: pfl.document_by_source_type || {},
      scope: "fiscal_document_lines.metadata.taxable_revenue_type = 'platform_fee'",
      note: 'Principal/top-up/escrow gross lines are informational only and excluded from AQOND taxable platform revenue.',
    },
    platform_revenue_rows: {
      total_amount: platformRevenuesTotal,
      row_count: Number(p.platform_revenue_count || 0),
      by_source_type: p.by_source_type || {},
      scope: 'platform_revenues.amount by source_type',
      note: 'Supplementary table only. Future runtime writes may populate it, but reconciliation canonical source is payment_ledger_audit commission/fee rows.',
    },
    commission_or_fee_ledger_rows: {
      total_amount: platformFeeLedgerTotal,
      row_count: Number(pfl.platform_fee_ledger_row_count || 0),
      by_source_type: pfl.ledger_by_source_type || {},
      source_type_mapping: PLATFORM_REVENUE_SOURCE_MAPPING,
      canonical_decision: PLATFORM_REVENUE_CANONICAL_DECISION,
      scope: 'match_job_commission, booking_fee, advance_job_commission, wallet_deposit_margin, withdrawal_fee_margin, other_platform_fee',
      note: 'Principal/top-up/escrow gross amounts are excluded from this platform fee ledger bucket.',
    },
    platform_reconciliation_buckets: {
      document_lines_vs_platform_revenues: {
        document_platform_fee_total: documentPlatformFeeTotal,
        platform_revenues_total: platformRevenuesTotal,
        variance: round2(documentPlatformFeeTotal - platformRevenuesTotal),
      },
      document_lines_vs_platform_fee_ledger: {
        document_platform_fee_total: documentPlatformFeeTotal,
        platform_fee_ledger_total: platformFeeLedgerTotal,
        variance: round2(documentPlatformFeeTotal - platformFeeLedgerTotal),
      },
      platform_revenues_vs_platform_fee_ledger: {
        platform_revenues_total: platformRevenuesTotal,
        platform_fee_ledger_total: platformFeeLedgerTotal,
        variance: round2(platformRevenuesTotal - platformFeeLedgerTotal),
      },
    },
    wht_totals_vs_provider_deductions: {
      posting_withheld_total: round2(w.posting_withheld_total),
      ledger_withheld_total: round2(w.ledger_withheld_total),
      variance: round2(Number(w.posting_withheld_total || 0) - Number(w.ledger_withheld_total || 0)),
      posting_count: Number(w.posting_count || 0),
    },
    platform_revenue_vs_platform_revenues: {
      comparison_scope: 'compatibility_alias_for_document_lines_vs_platform_revenues',
      document_platform_fee_total: documentPlatformFeeTotal,
      platform_revenues_total: platformRevenuesTotal,
      variance: round2(documentPlatformFeeTotal - platformRevenuesTotal),
      platform_revenue_count: Number(p.platform_revenue_count || 0),
    },
    void_and_credit_notes: {
      voided_count: Number(vc.voided_count || 0),
      voided_total: round2(vc.voided_total),
      credit_note_count: Number(vc.credit_note_count || 0),
      credit_note_total: round2(vc.credit_note_total),
    },
  };
  return { ...out, checksum_sha256: sha256(JSON.stringify(out)) };
}

async function buildMonthlyTaxPack(client, period, generatedBy) {
  const [vatSales, wht, platformRevenue, providerIncome, walletFlows, reconciliation] = await Promise.all([
    buildVatSalesReport(client, period, generatedBy),
    buildWhtReport(client, period, generatedBy),
    buildPlatformRevenueReport(client, period, generatedBy),
    buildProviderIncomeReport(client, period, generatedBy),
    buildWalletFlowReport(client, period, generatedBy),
    buildReconciliation(client, period),
  ]);
  const files = [
    ['vat-sales', vatSales],
    ['wht', wht],
    ['platform-revenue', platformRevenue],
    ['provider-income', providerIncome],
    ['wallet-flows', walletFlows],
  ].map(([name, report]) => ({
    name,
    filename: `tax-${name}-${period.year}-${String(period.month).padStart(2, '0')}.csv`,
    checksum_sha256: report.meta.csv_checksum_sha256,
    row_count: report.meta.row_count,
    csv: CSV_BOM + report.csv,
  }));
  const manifest = {
    report_type: 'monthly-pack',
    generated_by: generatedBy || 'admin',
    generated_at: new Date().toISOString(),
    filters: { month: period.month, year: period.year, from_date: period.fromDate, to_date_exclusive: period.toDateExclusive },
    files: files.map(({ csv, ...f }) => f),
    reconciliation,
  };
  return { meta: { ...manifest, checksum_sha256: sha256(JSON.stringify(manifest)) }, files };
}

export {
  CSV_BOM,
  buildMonthlyTaxPack,
  buildPlatformRevenueReport,
  buildProviderIncomeReport,
  buildReconciliation,
  buildVatSalesReport,
  buildWalletFlowReport,
  buildWhtReport,
  parseMonthYear,
};
