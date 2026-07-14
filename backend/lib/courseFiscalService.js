/**
 * Course marketplace fiscal document drafts — platform fee + buyer receipt + seller statement.
 */
import {
  calculateLine,
  generateFiscalDocumentDraft,
  splitVatInclusive,
} from './taxDocumentService.js';

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function informationalLine(description, displayAmount, metadata = {}) {
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
      revenue_recognition: metadata.revenue_recognition || 'not_platform_revenue',
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
      taxable_revenue_type: metadata.taxable_revenue_type || 'platform_fee',
    },
  });
}

function parseMeta(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function buildCourseBuyerReceiptLines(ledger, meta) {
  const gross = round2(meta.gross_amount ?? ledger.amount ?? 0);
  const platformFee = round2(meta.platform_fee ?? meta.platform_margin_baht ?? 0);
  const instructorNet = round2(meta.instructor_net ?? Math.max(0, gross - platformFee));
  const courseTitle = meta.course_title || 'AQOND Course';
  return [
    informationalLine(`ค่าคอร์ส: ${courseTitle}`, gross, {
      wallet_component: 'course_gross',
      course_id: meta.course_id || null,
    }),
    informationalLine('ค่าธรรมเนียมแพลตฟอร์ม (รวมในราคา)', platformFee, {
      wallet_component: 'platform_fee',
      taxable_revenue_type: 'platform_fee',
      platform_revenue_source: 'course_commission',
    }),
    informationalLine('รายได้สุทธิผู้สอน (โอนตามรอบ payout)', instructorNet, {
      wallet_component: 'instructor_net',
      revenue_recognition: 'not_platform_revenue',
    }),
  ];
}

function buildCoursePlatformFeeTaxLines(ledger, meta, company) {
  const platformFee = round2(meta.platform_fee ?? meta.platform_margin_baht ?? 0);
  if (!(platformFee > 0)) return [];
  const vatRate = Number(company?.default_vat_rate_percent ?? 7);
  return [
    taxableServiceFeeLine(
      `ค่าบริการแพลตฟอร์มคอร์ส (${meta.course_title || 'Course'})`,
      platformFee,
      vatRate,
      {
        taxable_revenue_type: 'platform_fee',
        platform_revenue_source: 'course_commission',
        course_id: meta.course_id || null,
        order_id: ledger.payment_id || null,
      },
    ),
  ];
}

function buildCourseSellerStatementLines(ledger, meta) {
  const instructorNet = round2(meta.instructor_net ?? 0);
  if (!(instructorNet > 0)) return [];
  return [
    calculateLine({
      description: `รายได้สุทธิจากการขายคอร์ส: ${meta.course_title || 'Course'}`,
      quantity: 1,
      unit_amount: instructorNet,
      taxable_amount: instructorNet,
      vat_rate_percent: 0,
      wht_rate_percent: 0,
      total_amount: instructorNet,
      metadata: {
        course_id: meta.course_id || null,
        order_id: ledger.payment_id || null,
        document_purpose: 'seller_statement',
        revenue_recognition: 'instructor_net',
      },
    }),
  ];
}

async function generateCourseFiscalDocumentDraftForLedger(client, {
  ledgerId,
  documentType,
  partyRole,
  partyUserId = null,
  lines,
  actorId = 'course_tax_auto',
  reason,
} = {}) {
  if (!Array.isArray(lines) || !lines.length) {
    return { skipped: true, reason: 'no_fiscal_lines', documentType, partyRole };
  }
  return generateFiscalDocumentDraft(client, {
    sourceEventId: ledgerId,
    documentType,
    partyRole,
    partyUserId,
    lines,
    actorType: 'system',
    actorId,
    reason,
  });
}

export async function generateCourseFiscalDraftsForLedger(client, { ledgerId, actorId = 'course_tax_auto' } = {}) {
  const ledgerResult = await client.query(
    `SELECT * FROM payment_ledger_audit WHERE id = $1 LIMIT 1`,
    [ledgerId],
  );
  const ledger = ledgerResult.rows?.[0];
  if (!ledger || String(ledger.event_type) !== 'course_purchase') {
    return { skipped: true, reason: 'not_course_purchase_ledger' };
  }
  if (ledger.status && String(ledger.status).toLowerCase() !== 'completed') {
    return { skipped: true, reason: 'ledger_not_completed' };
  }

  const meta = parseMeta(ledger.metadata);
  const companyResult = await client.query(`SELECT * FROM tax_company_settings WHERE id = 'aqond' LIMIT 1`);
  const company = companyResult.rows?.[0] || {};

  const results = {};
  results.buyerReceipt = await generateCourseFiscalDocumentDraftForLedger(client, {
    ledgerId,
    documentType: 'receipt',
    partyRole: 'customer',
    partyUserId: ledger.user_id,
    lines: buildCourseBuyerReceiptLines(ledger, meta),
    actorId,
    reason: 'course_purchase_buyer_receipt',
  });

  const platformLines = buildCoursePlatformFeeTaxLines(ledger, meta, company);
  if (platformLines.length) {
    results.platformFeeInvoice = await generateCourseFiscalDocumentDraftForLedger(client, {
      ledgerId,
      documentType: 'tax_invoice',
      partyRole: 'customer',
      partyUserId: ledger.user_id,
      lines: platformLines,
      actorId,
      reason: 'course_platform_fee_tax_invoice',
    });
  }

  if (ledger.provider_id && meta.instructor_net > 0) {
    results.sellerStatement = await generateCourseFiscalDocumentDraftForLedger(client, {
      ledgerId,
      documentType: 'receipt',
      partyRole: 'payee',
      partyUserId: ledger.provider_id,
      lines: buildCourseSellerStatementLines(ledger, meta),
      actorId,
      reason: 'course_instructor_seller_statement',
    });
  }

  return results;
}

function buildCoursePayoutReleaseLines(ledger, meta) {
  const releasedAmount = round2(meta.released_amount ?? ledger.amount ?? 0);
  if (!(releasedAmount > 0)) return [];
  const courseTitle = meta.course_title || 'Course';
  return [
    calculateLine({
      description: `รายได้สุทธิจากการขายคอร์ส (release): ${courseTitle}`,
      quantity: 1,
      unit_amount: releasedAmount,
      taxable_amount: releasedAmount,
      vat_rate_percent: 0,
      wht_rate_percent: 0,
      total_amount: releasedAmount,
      metadata: {
        course_id: meta.course_id || null,
        order_id: meta.order_id || ledger.payment_id || null,
        document_purpose: 'seller_statement',
        revenue_recognition: 'instructor_net_payout_release',
        payout_ledger_id: ledger.id,
      },
    }),
  ];
}

export async function generateCoursePayoutFiscalDraftForLedger(client, { ledgerId, actorId = 'course_payout_fiscal' } = {}) {
  const ledgerResult = await client.query(
    `SELECT * FROM payment_ledger_audit WHERE id = $1 LIMIT 1`,
    [ledgerId],
  );
  const ledger = ledgerResult.rows?.[0];
  if (!ledger || String(ledger.event_type) !== 'course_instructor_payout') {
    return { skipped: true, reason: 'not_course_instructor_payout_ledger' };
  }
  if (ledger.status && String(ledger.status).toLowerCase() !== 'completed') {
    return { skipped: true, reason: 'ledger_not_completed' };
  }

  const meta = parseMeta(ledger.metadata);
  if (!meta.course_title && meta.course_id) {
    const cr = await client.query(`SELECT title FROM courses WHERE id = $1 LIMIT 1`, [meta.course_id]);
    meta.course_title = cr.rows?.[0]?.title || 'Course';
  }

  const lines = buildCoursePayoutReleaseLines(ledger, meta);
  if (!lines.length) return { skipped: true, reason: 'no_fiscal_lines' };

  return generateCourseFiscalDocumentDraftForLedger(client, {
    ledgerId,
    documentType: 'receipt',
    partyRole: 'payee',
    partyUserId: ledger.provider_id || ledger.user_id,
    lines,
    actorId,
    reason: 'course_instructor_payout_seller_statement',
  });
}

export async function tryGenerateCoursePayoutFiscalDraft(pool, { ledgerId, actorId = 'course_payout_fiscal' } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await generateCoursePayoutFiscalDraftForLedger(client, { ledgerId, actorId });
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.warn('[courseFiscalService] payout fiscal draft skipped:', err?.message || err);
    return { skipped: true, reason: err?.message || 'course_payout_fiscal_failed' };
  } finally {
    client.release();
  }
}

export async function tryGenerateCourseFiscalDrafts(pool, { ledgerId, actorId = 'course_tax_auto' } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await generateCourseFiscalDraftsForLedger(client, { ledgerId, actorId });
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.warn('[courseFiscalService] fiscal draft skipped:', err?.message || err);
    return { skipped: true, reason: err?.message || 'course_fiscal_failed' };
  } finally {
    client.release();
  }
}

export {
  buildCourseBuyerReceiptLines,
  buildCoursePlatformFeeTaxLines,
  buildCourseSellerStatementLines,
};
