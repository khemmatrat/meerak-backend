const DOC_PREFIX = {
  tax_invoice: 'AQ-TI',
  receipt: 'AQ-RC',
  withholding_certificate: 'AQ-WHT',
  credit_note: 'AQ-CN',
};

const DOCUMENT_TYPES = new Set(['tax_invoice', 'receipt', 'withholding_certificate', 'credit_note']);
const PARTY_ROLES = new Set(['customer', 'buyer', 'provider', 'payee', 'payer', 'platform']);

function cleanText(value, maxLen = 1000) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

function round2(value) {
  const n = Number(value || 0);
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function splitVatInclusive(grossAmount, vatRatePercent = 7) {
  const gross = round2(grossAmount);
  const rate = Number(vatRatePercent || 0);
  if (!(gross > 0) || !(rate > 0)) {
    return { vat_base_amount: gross, vat_amount: 0, gross_amount: gross };
  }
  const base = round2(gross / (1 + rate / 100));
  return {
    vat_base_amount: base,
    vat_amount: round2(gross - base),
    gross_amount: gross,
  };
}

function normalizeDocumentType(value) {
  const s = String(value || '').trim().toLowerCase();
  return DOCUMENT_TYPES.has(s) ? s : 'tax_invoice';
}

function normalizePartyRole(value) {
  const s = String(value || '').trim().toLowerCase();
  return PARTY_ROLES.has(s) ? s : 'customer';
}

function buildFiscalDocumentIdempotencyKey({ sourceEventId, documentType, partyRole } = {}) {
  const sourceId = cleanText(sourceEventId, 255);
  if (!sourceId) return null;
  return `${sourceId}:${normalizeDocumentType(documentType)}:${normalizePartyRole(partyRole)}`;
}

function hasSnapshotValue(snapshot, key) {
  return !!cleanText(snapshot?.[key], 2000);
}

function issueReadinessRequirement(documentType) {
  const type = normalizeDocumentType(documentType);
  if (type === 'tax_invoice' || type === 'credit_note') {
    return {
      required: true,
      label: 'Tax Invoice/Credit Note requires complete seller and buyer tax identity before issue.',
      sellerFields: ['legal_name', 'tax_id', 'registered_address', 'branch_code'],
      buyerFields: ['legal_name', 'tax_id', 'registered_address'],
    };
  }
  if (type === 'withholding_certificate') {
    return {
      required: true,
      label: 'Withholding Certificate requires complete withholding agent and payee/provider tax identity before issue.',
      sellerFields: ['legal_name', 'tax_id', 'registered_address', 'branch_code'],
      buyerFields: ['legal_name', 'tax_id', 'registered_address'],
    };
  }
  return {
    required: false,
    label: 'Receipt can be issued with lighter buyer identity, but must not be labelled Tax Invoice.',
    sellerFields: ['legal_name'],
    buyerFields: ['legal_name'],
  };
}

function validateFiscalDocumentIssueReadiness(row = {}) {
  const requirement = issueReadinessRequirement(row.document_type);
  const seller = row.seller_snapshot || {};
  const buyer = row.buyer_snapshot || {};
  const missingFields = [];

  for (const field of requirement.sellerFields) {
    if (!hasSnapshotValue(seller, field)) missingFields.push(`seller.${field}`);
  }
  for (const field of requirement.buyerFields) {
    if (!hasSnapshotValue(buyer, field)) missingFields.push(`buyer.${field}`);
  }

  return {
    ok: missingFields.length === 0,
    required: requirement.required,
    document_type: normalizeDocumentType(row.document_type),
    message: requirement.label,
    missing_fields: missingFields,
  };
}

function createIssueReadinessError(readiness) {
  const err = new Error('Tax profile is required before issuing this fiscal document');
  err.code = 'TAX_PROFILE_REQUIRED_FOR_ISSUE';
  err.status = 400;
  err.missing_fields = readiness.missing_fields;
  err.readiness = readiness;
  return err;
}

function mapFiscalDocument(row, lines = []) {
  if (!row) return null;
  return {
    id: String(row.id),
    document_no: row.document_no || null,
    document_type: row.document_type,
    status: row.status,
    currency: row.currency || 'THB',
    source_event_id: row.source_event_id || null,
    source_event_type: row.source_event_type || null,
    source_payment_id: row.source_payment_id || null,
    source_job_id: row.source_job_id || null,
    source_payout_id: row.source_payout_id || null,
    source_charge_id: row.source_charge_id || null,
    party_user_id: row.party_user_id ? String(row.party_user_id) : null,
    party_role: row.party_role || 'customer',
    seller_snapshot: row.seller_snapshot || {},
    buyer_snapshot: row.buyer_snapshot || {},
    source_snapshot: row.source_snapshot || {},
    subtotal_amount: Number(row.subtotal_amount || 0),
    vat_amount: Number(row.vat_amount || 0),
    wht_amount: Number(row.wht_amount || 0),
    total_amount: Number(row.total_amount || 0),
    credit_note_of_id: row.credit_note_of_id ? String(row.credit_note_of_id) : null,
    issue_reason: row.issue_reason || null,
    void_reason: row.void_reason || null,
    credit_note_reason: row.credit_note_reason || null,
    created_by: row.created_by || null,
    updated_by: row.updated_by || null,
    issued_by: row.issued_by || null,
    voided_by: row.voided_by || null,
    exported_by: row.exported_by || null,
    issued_at: row.issued_at ? new Date(row.issued_at).toISOString() : null,
    voided_at: row.voided_at ? new Date(row.voided_at).toISOString() : null,
    exported_at: row.exported_at ? new Date(row.exported_at).toISOString() : null,
    etax_status: row.etax_status || 'not_ready',
    etax_provider: row.etax_provider || null,
    etax_provider_document_id: row.etax_provider_document_id || null,
    etax_submitted_at: row.etax_submitted_at ? new Date(row.etax_submitted_at).toISOString() : null,
    etax_response_json: row.etax_response_json || null,
    etax_error: row.etax_error || null,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    lines: lines.map(mapFiscalDocumentLine),
  };
}

function mapFiscalDocumentLine(row) {
  return {
    id: String(row.id),
    document_id: String(row.document_id),
    line_no: Number(row.line_no),
    description: row.description,
    quantity: Number(row.quantity || 1),
    unit_amount: Number(row.unit_amount || 0),
    taxable_amount: Number(row.taxable_amount || 0),
    vat_rate_percent: Number(row.vat_rate_percent || 0),
    vat_amount: Number(row.vat_amount || 0),
    wht_rate_percent: Number(row.wht_rate_percent || 0),
    wht_amount: Number(row.wht_amount || 0),
    total_amount: Number(row.total_amount || 0),
    metadata: row.metadata || {},
  };
}

function calculateLine(input = {}) {
  const quantity = Number(input.quantity || 1) || 1;
  const unitAmount = round2(input.unit_amount ?? input.unitAmount ?? input.taxable_amount ?? 0);
  const taxableAmount = round2(input.taxable_amount ?? unitAmount * quantity);
  const vatRate = Number(input.vat_rate_percent ?? input.vatRatePercent ?? 0) || 0;
  const whtRate = Number(input.wht_rate_percent ?? input.whtRatePercent ?? 0) || 0;
  const vatAmount = round2(input.vat_amount ?? taxableAmount * (vatRate / 100));
  const whtAmount = round2(input.wht_amount ?? taxableAmount * (whtRate / 100));
  const totalAmount = round2(input.total_amount ?? taxableAmount + vatAmount - whtAmount);
  return {
    description: cleanText(input.description, 500) || 'รายการเอกสารภาษี',
    quantity,
    unit_amount: unitAmount,
    taxable_amount: taxableAmount,
    vat_rate_percent: vatRate,
    vat_amount: vatAmount,
    wht_rate_percent: whtRate,
    wht_amount: whtAmount,
    total_amount: totalAmount,
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
  };
}

function summarizeLines(lines = []) {
  return lines.reduce(
    (acc, line) => {
      acc.subtotal_amount = round2(acc.subtotal_amount + Number(line.taxable_amount || 0));
      acc.vat_amount = round2(acc.vat_amount + Number(line.vat_amount || 0));
      acc.wht_amount = round2(acc.wht_amount + Number(line.wht_amount || 0));
      acc.total_amount = round2(acc.total_amount + Number(line.total_amount || 0));
      return acc;
    },
    { subtotal_amount: 0, vat_amount: 0, wht_amount: 0, total_amount: 0 },
  );
}

function buildSellerSnapshot(company = {}) {
  return {
    legal_name: company.legal_name || 'AQOND Technology Co., Ltd.',
    registered_address: company.registered_address || null,
    tax_id: company.tax_id || null,
    branch_code: company.branch_code || '00000',
    branch_name: company.branch_name || 'สำนักงานใหญ่',
    vat_registered: company.vat_registered !== false,
    vat_rate_percent: Number(company.vat_rate_percent ?? 7),
    wht_rate_percent: Number(company.wht_rate_percent ?? 3),
    support_email: company.support_email || null,
    support_line: company.support_line || null,
    help_center_url: company.help_center_url || null,
    phone_optional: company.phone_optional || null,
  };
}

function buildBuyerSnapshot(user = {}, profile = {}) {
  return {
    user_id: user?.id ? String(user.id) : null,
    legal_name: profile?.legal_name || user?.full_name || user?.email || null,
    tax_id: profile?.tax_id || null,
    tax_entity_type: profile?.tax_entity_type || 'unknown',
    registered_address: profile?.registered_address || null,
    branch_code: profile?.branch_code || null,
    branch_name: profile?.branch_name || null,
    country: profile?.country || 'TH',
    email: profile?.email || user?.email || null,
    verified_status: profile?.verified_status || 'unverified',
  };
}

function buildSourceSnapshot(ledger = {}) {
  return {
    ledger_id: ledger.id || null,
    event_type: ledger.event_type || null,
    payment_id: ledger.payment_id || null,
    gateway: ledger.gateway || null,
    job_id: ledger.job_id || null,
    bill_no: ledger.bill_no || null,
    transaction_no: ledger.transaction_no || null,
    tax_ref_id: ledger.tax_ref_id || null,
    status: ledger.status || null,
    metadata: ledger.metadata || {},
  };
}

async function getCompanySettings(client) {
  const r = await client.query(`SELECT * FROM tax_company_settings WHERE id = 'aqond' LIMIT 1`);
  return r.rows?.[0] || {};
}

async function getUserAndTaxProfile(client, userId) {
  if (!userId) return { user: {}, profile: {} };
  const r = await client.query(
    `SELECT u.id, u.full_name, u.email, u.role,
            p.legal_name, p.tax_id, p.tax_entity_type, p.registered_address,
            p.branch_code, p.branch_name, p.country, p.email AS tax_email,
            p.verified_status
     FROM users u
     LEFT JOIN tax_user_profiles p ON p.user_id = u.id
     WHERE u.id = $1::uuid
     LIMIT 1`,
    [String(userId)],
  );
  const row = r.rows?.[0] || {};
  return {
    user: {
      id: row.id,
      full_name: row.full_name,
      email: row.email,
      role: row.role,
    },
    profile: {
      legal_name: row.legal_name,
      tax_id: row.tax_id,
      tax_entity_type: row.tax_entity_type,
      registered_address: row.registered_address,
      branch_code: row.branch_code,
      branch_name: row.branch_name,
      country: row.country,
      email: row.tax_email,
      verified_status: row.verified_status,
    },
  };
}

async function appendFiscalDocumentEvent(client, {
  documentId,
  actorType = 'system',
  actorId = null,
  action,
  reason = null,
  beforeRow = null,
  afterRow = null,
  sourceIp = null,
}) {
  await client.query(
    `INSERT INTO fiscal_document_events
     (document_id, actor_type, actor_id, action, reason, before_json, after_json, source_ip)
     VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)`,
    [
      documentId || null,
      actorType,
      actorId ? String(actorId) : null,
      action,
      reason,
      beforeRow ? JSON.stringify(beforeRow) : null,
      afterRow ? JSON.stringify(afterRow) : null,
      sourceIp,
    ],
  );
}

async function getDocumentWithLines(client, documentId) {
  const doc = await client.query(`SELECT * FROM fiscal_documents WHERE id = $1::uuid LIMIT 1`, [String(documentId)]);
  if (!doc.rows?.length) return null;
  const lines = await client.query(
    `SELECT * FROM fiscal_document_lines WHERE document_id = $1::uuid ORDER BY line_no ASC`,
    [String(documentId)],
  );
  return mapFiscalDocument(doc.rows[0], lines.rows || []);
}

async function nextDocumentNo(client, documentType, issueDate = new Date()) {
  const type = normalizeDocumentType(documentType);
  const year = issueDate.getFullYear();
  const prefix = DOC_PREFIX[type] || 'AQ-DOC';
  await client.query(
    `INSERT INTO fiscal_document_number_sequences (document_type, fiscal_year, prefix, next_seq)
     VALUES ($1, $2, $3, 1)
     ON CONFLICT (document_type, fiscal_year) DO NOTHING`,
    [type, year, prefix],
  );
  const row = await client.query(
    `SELECT next_seq FROM fiscal_document_number_sequences
     WHERE document_type = $1 AND fiscal_year = $2
     FOR UPDATE`,
    [type, year],
  );
  const seq = Number(row.rows?.[0]?.next_seq || 1);
  await client.query(
    `UPDATE fiscal_document_number_sequences
     SET next_seq = $3, updated_at = NOW()
     WHERE document_type = $1 AND fiscal_year = $2`,
    [type, year, seq + 1],
  );
  return `${prefix}-${year}-${String(seq).padStart(6, '0')}`;
}

function defaultLinesFromLedger(ledger, documentType) {
  const amount = round2(ledger.amount || 0);
  return [
    calculateLine({
      description: documentType === 'withholding_certificate'
        ? `หนังสือรับรองหัก ณ ที่จ่าย (${ledger.event_type || 'ledger'})`
        : `เอกสารภาษีจากรายการ ${ledger.event_type || 'ledger'}`,
      quantity: 1,
      unit_amount: amount,
      taxable_amount: amount,
      vat_rate_percent: 0,
      wht_rate_percent: 0,
      metadata: {
        source_event_type: ledger.event_type || null,
        tax_calculation_phase: 'phase2_lifecycle_only',
      },
    }),
  ];
}

function informationalWalletLine(description, displayAmount, metadata = {}) {
  return calculateLine({
    description,
    quantity: 1,
    unit_amount: 0,
    taxable_amount: 0,
    vat_rate_percent: 0,
    vat_amount: 0,
    wht_rate_percent: 0,
    wht_amount: 0,
    total_amount: 0,
    metadata: {
      ...metadata,
      display_amount: round2(displayAmount),
      taxable: false,
      revenue_recognition: 'not_platform_revenue',
    },
  });
}

function taxableServiceFeeLine(description, grossAmount, vatRatePercent, metadata = {}) {
  const split = splitVatInclusive(grossAmount, vatRatePercent);
  return calculateLine({
    description,
    quantity: 1,
    unit_amount: split.vat_base_amount,
    taxable_amount: split.vat_base_amount,
    vat_rate_percent: Number(vatRatePercent || 0),
    vat_amount: split.vat_amount,
    wht_rate_percent: 0,
    wht_amount: 0,
    total_amount: split.gross_amount,
    metadata: {
      ...metadata,
      taxable: true,
      vat_inclusive: true,
      revenue_recognition: 'platform_service_fee',
    },
  });
}

function buildWalletDepositFiscalLines(ledger = {}, company = {}) {
  const metadata = ledger.metadata || {};
  const grossAmount = round2(ledger.amount || metadata.gross_amount || 0);
  const gatewayFee = round2(ledger.gateway_fee_amount || metadata.gateway_fee_amount || 0);
  const platformMargin = round2(ledger.platform_margin_amount || metadata.platform_margin_amount || 0);
  const netWalletCredit = round2(ledger.net_amount || metadata.net_to_wallet || grossAmount - gatewayFee - platformMargin);
  const vatRate = Number(company.vat_rate_percent ?? 7);
  const sourceType = metadata.source_type || ledger.gateway || null;
  const lines = [
    informationalWalletLine('ยอดเติมเงินเข้า Wallet (เงินต้น ไม่ใช่รายได้ AQOND)', grossAmount, {
      wallet_component: 'deposit_gross_amount',
      source_type: sourceType,
    }),
    informationalWalletLine('ค่าธรรมเนียมผู้ให้บริการชำระเงิน (pass-through ไม่ใช่รายได้ AQOND)', gatewayFee, {
      wallet_component: 'gateway_fee',
      source_type: sourceType,
    }),
  ];
  if (platformMargin > 0) {
    lines.push(taxableServiceFeeLine('ค่าบริการแพลตฟอร์มสำหรับเติมเงิน Wallet', platformMargin, vatRate, {
      wallet_component: 'platform_margin_service_fee',
      taxable_revenue_type: 'platform_fee',
      platform_revenue_source: 'wallet_deposit_margin',
      legacy_platform_revenue_source: `deposit_margin_${sourceType || 'wallet'}`,
      source_type: sourceType,
    }));
  }
  lines.push(informationalWalletLine('ยอดสุทธิเข้า Wallet', netWalletCredit, {
    wallet_component: 'net_wallet_credit',
    source_type: sourceType,
  }));
  return lines;
}

function buildWalletWithdrawalFiscalLines(ledger = {}, company = {}) {
  const metadata = ledger.metadata || {};
  const withdrawalAmount = round2(ledger.amount || metadata.net_transfer || 0);
  const withdrawalFee = round2(metadata.withdrawal_fee || 0);
  const processorCost = round2(metadata.processor_cost_estimate || 30);
  const platformMargin = round2(ledger.platform_margin_amount || metadata.platform_margin_amount || Math.max(0, withdrawalFee - processorCost));
  const vatRate = Number(company.vat_rate_percent ?? 7);
  const lines = [
    informationalWalletLine('ยอดถอนเงินจาก Wallet (เงินต้นของผู้ใช้ ไม่ใช่รายได้ AQOND)', withdrawalAmount, {
      wallet_component: 'withdrawal_principal',
      payout_request_id: metadata.payout_request_id || null,
    }),
    informationalWalletLine('ต้นทุนผู้ให้บริการโอนเงินโดยประมาณ (pass-through)', processorCost, {
      wallet_component: 'processor_cost_estimate',
      payout_request_id: metadata.payout_request_id || null,
    }),
  ];
  if (platformMargin > 0) {
    lines.push(taxableServiceFeeLine('ค่าบริการแพลตฟอร์มสำหรับถอนเงิน Wallet', platformMargin, vatRate, {
      wallet_component: 'withdrawal_platform_fee_margin',
      taxable_revenue_type: 'platform_fee',
      platform_revenue_source: 'withdrawal_fee_margin',
      payout_request_id: metadata.payout_request_id || null,
    }));
  }
  lines.push(informationalWalletLine('ยอดโอนสุทธิให้ผู้ใช้', withdrawalAmount, {
    wallet_component: 'net_transfer',
    payout_request_id: metadata.payout_request_id || null,
  }));
  return lines;
}

async function generateWalletFiscalDocumentDraftForLedger(client, {
  ledgerId,
  actorType = 'system',
  actorId = 'wallet_tax_auto',
  reason = 'wallet_fiscal_document_auto_draft',
  sourceIp = null,
} = {}) {
  const sourceId = cleanText(ledgerId, 255);
  if (!sourceId) return { skipped: true, reason: 'missing_ledger_id' };
  const ledgerResult = await client.query(
    `SELECT id, event_type, payment_id, gateway, job_id, amount, currency, status,
            bill_no, transaction_no, metadata, user_id, provider_id,
            gateway_fee_amount, platform_margin_amount, net_amount
     FROM payment_ledger_audit
     WHERE id = $1
     LIMIT 1`,
    [sourceId],
  );
  const ledger = ledgerResult.rows?.[0] || null;
  if (!ledger) return { skipped: true, reason: 'ledger_not_found' };
  if (ledger.status && String(ledger.status).toLowerCase() !== 'completed') {
    return { skipped: true, reason: 'ledger_not_completed' };
  }

  const eventType = String(ledger.event_type || '');
  const company = await getCompanySettings(client);
  let partyUserId = ledger.user_id || ledger.provider_id || null;
  let partyRole = 'customer';
  let lines = [];
  if (eventType === 'wallet_deposit') {
    const platformMargin = round2(ledger.platform_margin_amount || ledger.metadata?.platform_margin_amount || 0);
    if (!(platformMargin > 0)) return { skipped: true, reason: 'no_taxable_deposit_platform_fee' };
    lines = buildWalletDepositFiscalLines(ledger, company);
    partyRole = 'customer';
  } else if (eventType === 'user_payout_withdrawal') {
    const withdrawalFee = round2(ledger.metadata?.withdrawal_fee || 0);
    const processorCost = round2(ledger.metadata?.processor_cost_estimate || 30);
    const platformMargin = round2(ledger.platform_margin_amount || ledger.metadata?.platform_margin_amount || Math.max(0, withdrawalFee - processorCost));
    if (!(platformMargin > 0)) return { skipped: true, reason: 'no_taxable_withdrawal_platform_fee' };
    lines = buildWalletWithdrawalFiscalLines(ledger, company);
    partyRole = 'payee';
  } else {
    return { skipped: true, reason: 'unsupported_wallet_event_type', eventType };
  }

  return generateFiscalDocumentDraft(client, {
    sourceEventId: sourceId,
    documentType: 'tax_invoice',
    partyRole,
    partyUserId,
    lines,
    actorType,
    actorId,
    reason,
    sourceIp,
  });
}

async function tryGenerateWalletFiscalDocumentDraft(pool, options = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await generateWalletFiscalDocumentDraftForLedger(client, options);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => { });
    console.warn('[taxDocumentService] wallet fiscal draft skipped:', err?.message || err);
    return { skipped: true, reason: err?.message || 'wallet_fiscal_document_failed' };
  } finally {
    client.release();
  }
}

async function generateFiscalDocumentDraft(client, {
  sourceEventId,
  documentType = 'tax_invoice',
  partyRole = 'customer',
  partyUserId = null,
  lines = null,
  actorType = 'admin',
  actorId = null,
  reason = null,
  sourceIp = null,
}) {
  const type = normalizeDocumentType(documentType);
  const role = normalizePartyRole(partyRole);
  const sourceId = cleanText(sourceEventId, 255);
  if (!sourceId) throw new Error('source_event_id required');

  const existing = await client.query(
    `SELECT id FROM fiscal_documents
     WHERE source_event_id = $1 AND document_type = $2 AND party_role = $3 AND credit_note_of_id IS NULL
     LIMIT 1`,
    [sourceId, type, role],
  );
  if (existing.rows?.[0]) {
    return { document: await getDocumentWithLines(client, existing.rows[0].id), created: false };
  }

  const ledgerResult = await client.query(
    `SELECT id, tax_ref_id, event_type, payment_id, gateway, job_id, amount, currency,
            status, bill_no, transaction_no, metadata, user_id, provider_id, created_at
     FROM payment_ledger_audit
     WHERE id = $1
     LIMIT 1`,
    [sourceId],
  );
  const ledger = ledgerResult.rows?.[0];
  if (!ledger) throw new Error('source ledger event not found');

  const resolvedPartyUserId = partyUserId || ledger.user_id || ledger.provider_id || null;
  const company = await getCompanySettings(client);
  const { user, profile } = await getUserAndTaxProfile(client, resolvedPartyUserId);
  const normalizedLines = Array.isArray(lines) && lines.length
    ? lines.map((line) => calculateLine(line))
    : defaultLinesFromLedger(ledger, type);
  const totals = summarizeLines(normalizedLines);
  const sellerSnapshot = buildSellerSnapshot(company);
  const buyerSnapshot = buildBuyerSnapshot(user, profile);
  const sourceSnapshot = buildSourceSnapshot(ledger);

  const doc = await client.query(
    `INSERT INTO fiscal_documents
       (document_type, status, currency, source_event_id, source_event_type, source_payment_id,
        source_job_id, source_payout_id, source_charge_id, party_user_id, party_role,
        seller_snapshot, buyer_snapshot, source_snapshot, subtotal_amount, vat_amount,
        wht_amount, total_amount, issue_reason, created_by, updated_by)
     VALUES
       ($1, 'draft', $2, $3, $4, $5, $6, $7, $8, $9::uuid, $10,
        $11::jsonb, $12::jsonb, $13::jsonb, $14, $15, $16, $17, $18, $19, $19)
     RETURNING *`,
    [
      type,
      ledger.currency || 'THB',
      sourceId,
      ledger.event_type || null,
      ledger.payment_id || null,
      ledger.job_id || null,
      null,
      ledger.metadata?.charge_id || null,
      resolvedPartyUserId || null,
      role,
      JSON.stringify(sellerSnapshot),
      JSON.stringify(buyerSnapshot),
      JSON.stringify(sourceSnapshot),
      totals.subtotal_amount,
      totals.vat_amount,
      totals.wht_amount,
      totals.total_amount,
      reason,
      actorId ? String(actorId) : null,
    ],
  );

  const documentId = doc.rows[0].id;
  for (const [idx, line] of normalizedLines.entries()) {
    await client.query(
      `INSERT INTO fiscal_document_lines
         (document_id, line_no, description, quantity, unit_amount, taxable_amount,
          vat_rate_percent, vat_amount, wht_rate_percent, wht_amount, total_amount, metadata)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)`,
      [
        documentId,
        idx + 1,
        line.description,
        line.quantity,
        line.unit_amount,
        line.taxable_amount,
        line.vat_rate_percent,
        line.vat_amount,
        line.wht_rate_percent,
        line.wht_amount,
        line.total_amount,
        JSON.stringify(line.metadata || {}),
      ],
    );
  }
  await appendFiscalDocumentEvent(client, {
    documentId,
    actorType,
    actorId,
    action: 'FISCAL_DOCUMENT_DRAFT_CREATED',
    reason,
    afterRow: doc.rows[0],
    sourceIp,
  });
  return { document: await getDocumentWithLines(client, documentId), created: true };
}

async function issueFiscalDocument(client, {
  documentId,
  actorType = 'admin',
  actorId = null,
  reason = null,
  sourceIp = null,
}) {
  const beforeResult = await client.query(`SELECT * FROM fiscal_documents WHERE id = $1::uuid FOR UPDATE`, [String(documentId)]);
  const before = beforeResult.rows?.[0];
  if (!before) throw new Error('document not found');
  if (before.status !== 'draft') throw new Error(`document must be draft before issue (current: ${before.status})`);
  const readiness = validateFiscalDocumentIssueReadiness(before);
  if (!readiness.ok) throw createIssueReadinessError(readiness);
  const documentNo = before.document_no || await nextDocumentNo(client, before.document_type, new Date());
  const updated = await client.query(
    `UPDATE fiscal_documents
     SET status = 'issued', document_no = $2, issued_by = $3, issued_at = NOW(),
         issue_reason = COALESCE($4, issue_reason), updated_by = $3, updated_at = NOW()
     WHERE id = $1::uuid
     RETURNING *`,
    [String(documentId), documentNo, actorId ? String(actorId) : null, reason],
  );
  await appendFiscalDocumentEvent(client, {
    documentId,
    actorType,
    actorId,
    action: 'FISCAL_DOCUMENT_ISSUED',
    reason,
    beforeRow: before,
    afterRow: updated.rows[0],
    sourceIp,
  });
  return getDocumentWithLines(client, documentId);
}

async function voidFiscalDocument(client, {
  documentId,
  actorType = 'admin',
  actorId = null,
  reason,
  sourceIp = null,
}) {
  const beforeResult = await client.query(`SELECT * FROM fiscal_documents WHERE id = $1::uuid FOR UPDATE`, [String(documentId)]);
  const before = beforeResult.rows?.[0];
  if (!before) throw new Error('document not found');
  if (!['draft', 'issued'].includes(before.status)) throw new Error(`document cannot be voided from status ${before.status}`);
  const updated = await client.query(
    `UPDATE fiscal_documents
     SET status = 'voided', void_reason = $2, voided_by = $3, voided_at = NOW(),
         updated_by = $3, updated_at = NOW()
     WHERE id = $1::uuid
     RETURNING *`,
    [String(documentId), cleanText(reason, 1000) || 'voided_by_admin', actorId ? String(actorId) : null],
  );
  await appendFiscalDocumentEvent(client, {
    documentId,
    actorType,
    actorId,
    action: 'FISCAL_DOCUMENT_VOIDED',
    reason,
    beforeRow: before,
    afterRow: updated.rows[0],
    sourceIp,
  });
  return getDocumentWithLines(client, documentId);
}

async function createCreditNoteForDocument(client, {
  documentId,
  actorType = 'admin',
  actorId = null,
  reason,
  sourceIp = null,
}) {
  const originalResult = await client.query(`SELECT * FROM fiscal_documents WHERE id = $1::uuid FOR UPDATE`, [String(documentId)]);
  const original = originalResult.rows?.[0];
  if (!original) throw new Error('document not found');
  const existing = await client.query(
    `SELECT id FROM fiscal_documents WHERE credit_note_of_id = $1::uuid AND document_type = 'credit_note' LIMIT 1`,
    [String(documentId)],
  );
  if (existing.rows?.[0]) {
    return { creditNote: await getDocumentWithLines(client, existing.rows[0].id), created: false };
  }
  if (!['issued', 'exported'].includes(original.status)) {
    throw new Error(`credit note requires issued/exported document (current: ${original.status})`);
  }

  const originalLines = await client.query(
    `SELECT * FROM fiscal_document_lines WHERE document_id = $1::uuid ORDER BY line_no ASC`,
    [String(documentId)],
  );
  const creditLines = (originalLines.rows || []).map((line) => calculateLine({
    description: `Credit note: ${line.description}`,
    quantity: line.quantity,
    unit_amount: -Math.abs(Number(line.unit_amount || 0)),
    taxable_amount: -Math.abs(Number(line.taxable_amount || 0)),
    vat_rate_percent: line.vat_rate_percent,
    vat_amount: -Math.abs(Number(line.vat_amount || 0)),
    wht_rate_percent: line.wht_rate_percent,
    wht_amount: -Math.abs(Number(line.wht_amount || 0)),
    total_amount: -Math.abs(Number(line.total_amount || 0)),
    metadata: { original_line_id: String(line.id) },
  }));
  const totals = summarizeLines(creditLines);
  const creditNo = await nextDocumentNo(client, 'credit_note', new Date());
  const creditDoc = await client.query(
    `INSERT INTO fiscal_documents
       (document_no, document_type, status, currency, source_event_id, source_event_type,
        source_payment_id, source_job_id, source_payout_id, source_charge_id, party_user_id,
        party_role, seller_snapshot, buyer_snapshot, source_snapshot, subtotal_amount,
        vat_amount, wht_amount, total_amount, credit_note_of_id, credit_note_reason,
        created_by, updated_by, issued_by, issued_at)
     VALUES
       ($1, 'credit_note', 'issued', $2, $3, $4, $5, $6, $7, $8, $9::uuid,
        $10, $11::jsonb, $12::jsonb, $13::jsonb, $14, $15, $16, $17,
        $18::uuid, $19, $20, $20, $20, NOW())
     RETURNING *`,
    [
      creditNo,
      original.currency || 'THB',
      original.source_event_id,
      original.source_event_type,
      original.source_payment_id,
      original.source_job_id,
      original.source_payout_id,
      original.source_charge_id,
      original.party_user_id,
      original.party_role,
      JSON.stringify(original.seller_snapshot || {}),
      JSON.stringify(original.buyer_snapshot || {}),
      JSON.stringify({ ...(original.source_snapshot || {}), credit_note_of_id: String(original.id) }),
      totals.subtotal_amount,
      totals.vat_amount,
      totals.wht_amount,
      totals.total_amount,
      original.id,
      cleanText(reason, 1000) || 'credit_note_issued',
      actorId ? String(actorId) : null,
    ],
  );
  const creditId = creditDoc.rows[0].id;
  for (const [idx, line] of creditLines.entries()) {
    await client.query(
      `INSERT INTO fiscal_document_lines
         (document_id, line_no, description, quantity, unit_amount, taxable_amount,
          vat_rate_percent, vat_amount, wht_rate_percent, wht_amount, total_amount, metadata)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)`,
      [
        creditId,
        idx + 1,
        line.description,
        line.quantity,
        line.unit_amount,
        line.taxable_amount,
        line.vat_rate_percent,
        line.vat_amount,
        line.wht_rate_percent,
        line.wht_amount,
        line.total_amount,
        JSON.stringify(line.metadata || {}),
      ],
    );
  }
  const originalUpdated = await client.query(
    `UPDATE fiscal_documents
     SET status = 'credit_note_issued', credit_note_reason = $2, updated_by = $3, updated_at = NOW()
     WHERE id = $1::uuid
     RETURNING *`,
    [String(documentId), cleanText(reason, 1000) || 'credit_note_issued', actorId ? String(actorId) : null],
  );
  await appendFiscalDocumentEvent(client, {
    documentId: original.id,
    actorType,
    actorId,
    action: 'FISCAL_DOCUMENT_CREDIT_NOTE_ISSUED',
    reason,
    beforeRow: original,
    afterRow: originalUpdated.rows[0],
    sourceIp,
  });
  await appendFiscalDocumentEvent(client, {
    documentId: creditId,
    actorType,
    actorId,
    action: 'FISCAL_CREDIT_NOTE_CREATED',
    reason,
    afterRow: creditDoc.rows[0],
    sourceIp,
  });
  return { creditNote: await getDocumentWithLines(client, creditId), created: true };
}

export {
  calculateLine,
  summarizeLines,
  splitVatInclusive,
  mapFiscalDocument,
  mapFiscalDocumentLine,
  nextDocumentNo,
  buildWalletDepositFiscalLines,
  buildWalletWithdrawalFiscalLines,
  generateWalletFiscalDocumentDraftForLedger,
  tryGenerateWalletFiscalDocumentDraft,
  generateFiscalDocumentDraft,
  issueFiscalDocument,
  voidFiscalDocument,
  createCreditNoteForDocument,
  getDocumentWithLines,
  appendFiscalDocumentEvent,
  normalizeDocumentType,
  normalizePartyRole,
  validateFiscalDocumentIssueReadiness,
  buildFiscalDocumentIdempotencyKey,
};
