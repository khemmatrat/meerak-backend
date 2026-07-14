import crypto from 'crypto';

function round2(value) {
  const n = Number(value || 0);
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function cleanText(value, maxLen = 1000) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, maxLen);
}

function sha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function requireField(errors, path, value, message) {
  if (value === undefined || value === null || String(value).trim() === '') {
    errors.push({ path, code: 'required', message });
  }
}

function validateEtaxDocument(document) {
  const errors = [];
  const warnings = [];
  if (!document) {
    return { ok: false, errors: [{ path: 'document', code: 'missing', message: 'document not found' }], warnings };
  }
  if (!['issued', 'exported', 'credit_note_issued'].includes(String(document.status || '').toLowerCase())) {
    errors.push({ path: 'status', code: 'not_issued', message: 'e-Tax dry-run requires issued/exported document' });
  }
  if (!['tax_invoice', 'receipt', 'withholding_certificate', 'credit_note'].includes(String(document.document_type || ''))) {
    errors.push({ path: 'document_type', code: 'unsupported', message: 'unsupported fiscal document type' });
  }
  requireField(errors, 'document_no', document.document_no, 'document number is required');
  requireField(errors, 'issued_at', document.issued_at, 'issue date is required');
  requireField(errors, 'seller.tax_id', document.seller_snapshot?.tax_id, 'seller Tax ID is required');
  requireField(errors, 'seller.legal_name', document.seller_snapshot?.legal_name, 'seller legal name is required');
  requireField(errors, 'seller.registered_address', document.seller_snapshot?.registered_address, 'seller registered address is required');
  requireField(errors, 'seller.branch_code', document.seller_snapshot?.branch_code, 'seller branch code is required');
  requireField(errors, 'buyer.legal_name', document.buyer_snapshot?.legal_name, 'buyer/payee legal name is required');
  requireField(errors, 'buyer.registered_address', document.buyer_snapshot?.registered_address, 'buyer/payee address is required');
  if (['tax_invoice', 'withholding_certificate'].includes(String(document.document_type || ''))) {
    requireField(errors, 'buyer.tax_id', document.buyer_snapshot?.tax_id, 'buyer/payee Tax ID is required for this document type');
  }
  if (!Array.isArray(document.lines) || document.lines.length === 0) {
    errors.push({ path: 'lines', code: 'empty', message: 'at least one fiscal document line is required' });
  }
  (document.lines || []).forEach((line, idx) => {
    requireField(errors, `lines.${idx}.description`, line.description, 'line description is required');
    if (Number(line.taxable_amount || 0) < 0 || Number(line.vat_amount || 0) < 0 || Number(line.wht_amount || 0) < 0) {
      errors.push({ path: `lines.${idx}`, code: 'negative_amount', message: 'negative tax amounts are not allowed' });
    }
  });
  if (round2(document.vat_amount) !== round2((document.lines || []).reduce((s, l) => s + Number(l.vat_amount || 0), 0))) {
    warnings.push({ path: 'vat_amount', code: 'header_line_variance', message: 'document VAT total differs from line VAT total' });
  }
  if (round2(document.wht_amount) !== round2((document.lines || []).reduce((s, l) => s + Number(l.wht_amount || 0), 0))) {
    warnings.push({ path: 'wht_amount', code: 'header_line_variance', message: 'document WHT total differs from line WHT total' });
  }
  return { ok: errors.length === 0, errors, warnings };
}

function buildEtaxPayload(document) {
  const payload = {
    schema_version: 'aqond.etax.v1',
    mode: 'dry_run',
    provider_neutral: true,
    document: {
      id: document.id,
      document_no: document.document_no,
      document_type: document.document_type,
      status: document.status,
      currency: document.currency || 'THB',
      issue_date: document.issued_at,
      issued_at: document.issued_at,
      created_at: document.created_at,
      credit_note_of_id: document.credit_note_of_id || null,
      references: {
        source_event_id: document.source_event_id || null,
        source_event_type: document.source_event_type || null,
        source_payment_id: document.source_payment_id || null,
        source_job_id: document.source_job_id || null,
        source_payout_id: document.source_payout_id || null,
        source_charge_id: document.source_charge_id || null,
      },
    },
    seller: {
      legal_name: cleanText(document.seller_snapshot?.legal_name),
      tax_id: cleanText(document.seller_snapshot?.tax_id),
      branch_code: cleanText(document.seller_snapshot?.branch_code || '00000'),
      branch_name: cleanText(document.seller_snapshot?.branch_name),
      address: cleanText(document.seller_snapshot?.registered_address, 2000),
      vat_registered: document.seller_snapshot?.vat_registered !== false,
    },
    buyer: {
      legal_name: cleanText(document.buyer_snapshot?.legal_name),
      tax_id: cleanText(document.buyer_snapshot?.tax_id),
      entity_type: cleanText(document.buyer_snapshot?.tax_entity_type || document.buyer_snapshot?.entity_type),
      branch_code: cleanText(document.buyer_snapshot?.branch_code),
      branch_name: cleanText(document.buyer_snapshot?.branch_name),
      address: cleanText(document.buyer_snapshot?.registered_address, 2000),
      email: cleanText(document.buyer_snapshot?.email),
      country: cleanText(document.buyer_snapshot?.country || 'TH'),
    },
    lines: (document.lines || []).map((line) => ({
      line_no: Number(line.line_no || 0),
      description: cleanText(line.description, 500),
      quantity: Number(line.quantity || 1),
      unit_amount: round2(line.unit_amount),
      taxable_amount: round2(line.taxable_amount),
      vat_rate_percent: Number(line.vat_rate_percent || 0),
      vat_amount: round2(line.vat_amount),
      wht_rate_percent: Number(line.wht_rate_percent || 0),
      wht_amount: round2(line.wht_amount),
      total_amount: round2(line.total_amount),
      metadata: {
        taxable_revenue_type: line.metadata?.taxable_revenue_type || null,
        wallet_component: line.metadata?.wallet_component || null,
        provider_earning_component: line.metadata?.provider_earning_component || null,
      },
    })),
    totals: {
      subtotal_amount: round2(document.subtotal_amount),
      vat_amount: round2(document.vat_amount),
      wht_amount: round2(document.wht_amount),
      total_amount: round2(document.total_amount),
    },
  };
  return { ...payload, payload_checksum_sha256: sha256(payload) };
}

function createDryRunEtaxAdapter({ provider = 'provider_neutral_dry_run' } = {}) {
  return {
    provider,
    validate(document) {
      return validateEtaxDocument(document);
    },
    buildPayload(document) {
      return buildEtaxPayload(document);
    },
    async submit() {
      return {
        submitted: false,
        status: 'submit_disabled',
        provider,
        error: 'Live e-Tax submission is disabled. Provide approved provider credentials and legal approval before enabling.',
      };
    },
    async getStatus(providerDocumentId) {
      return {
        provider,
        provider_document_id: providerDocumentId || null,
        status: providerDocumentId ? 'unknown_dry_run_only' : 'not_submitted',
      };
    },
  };
}

async function persistEtaxDryRunResult(client, documentId, { provider, validation, payload = null, actorId = null } = {}) {
  const status = validation?.ok ? 'dry_run_valid' : 'validation_failed';
  const response = validation?.ok
    ? { dry_run: true, provider, payload_checksum_sha256: payload?.payload_checksum_sha256 || null, warnings: validation.warnings || [] }
    : { dry_run: true, provider, validation_errors: validation?.errors || [], warnings: validation?.warnings || [] };
  await client.query(
    `UPDATE fiscal_documents
     SET etax_status = $2,
         etax_provider = $3,
         etax_response_json = $4::jsonb,
         etax_error = $5,
         updated_by = COALESCE($6, updated_by),
         updated_at = NOW()
     WHERE id = $1::uuid`,
    [
      String(documentId),
      status,
      provider,
      JSON.stringify(response),
      validation?.ok ? null : (validation?.errors || []).map((e) => `${e.path}: ${e.message}`).join('; ').slice(0, 2000),
      actorId,
    ],
  );
  return { status, response };
}

export {
  buildEtaxPayload,
  createDryRunEtaxAdapter,
  persistEtaxDryRunResult,
  validateEtaxDocument,
};
