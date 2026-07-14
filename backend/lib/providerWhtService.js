import {
  calculateLine,
  generateFiscalDocumentDraft,
} from './taxDocumentService.js';

function round2(value) {
  const n = Number(value || 0);
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function cleanText(value, maxLen = 1000) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s ? s.slice(0, maxLen) : null;
}

async function getConfiguredWhtRatePercent(client) {
  const cfg = await client.query(
    `SELECT value_json FROM tax_config WHERE key = 'wht_rate_percent' LIMIT 1`
  ).catch(() => ({ rows: [] }));
  const raw = cfg.rows?.[0]?.value_json?.value;
  const company = await client.query(`SELECT wht_rate_percent FROM tax_company_settings WHERE id = 'aqond' LIMIT 1`).catch(() => ({ rows: [] }));
  const rate = Number(raw ?? company.rows?.[0]?.wht_rate_percent ?? 3);
  return Number.isFinite(rate) && rate >= 0 ? rate : 3;
}

async function getTaxProfile(client, userId) {
  const r = await client.query(
    `SELECT * FROM tax_user_profiles WHERE user_id = $1::uuid LIMIT 1`,
    [String(userId)],
  ).catch(() => ({ rows: [] }));
  return r.rows?.[0] || null;
}

async function getCompanySnapshot(client) {
  const r = await client.query(`SELECT * FROM tax_company_settings WHERE id = 'aqond' LIMIT 1`).catch(() => ({ rows: [] }));
  const row = r.rows?.[0] || {};
  return {
    legal_name: row.legal_name || 'AQOND Technology Co., Ltd.',
    tax_id: row.tax_id || null,
    registered_address: row.registered_address || null,
    branch_code: row.branch_code || '00000',
    branch_name: row.branch_name || 'สำนักงานใหญ่',
  };
}

function providerWhtEligibility(profile) {
  if (!profile) return { eligible: false, status: 'blocked_missing_tax_profile', reason: 'missing_tax_profile' };
  const entityType = String(profile.tax_entity_type || '').toLowerCase();
  const verifiedStatus = String(profile.verified_status || '').toLowerCase();
  if (entityType === 'foreign') return { eligible: false, status: 'not_eligible', reason: 'foreign_provider_out_of_scope' };
  if (!profile.legal_name || !profile.tax_id || !profile.registered_address) {
    return { eligible: false, status: 'blocked_missing_tax_profile', reason: 'missing_required_tax_profile_fields' };
  }
  if (verifiedStatus !== 'verified') {
    return { eligible: false, status: 'blocked_missing_tax_profile', reason: 'tax_profile_not_verified' };
  }
  return { eligible: true, status: 'eligible', reason: 'thai_verified_provider_service_income' };
}

function buildProviderTaxProfileSnapshot(profile = {}) {
  return {
    legal_name: profile.legal_name || null,
    tax_id: profile.tax_id || null,
    tax_entity_type: profile.tax_entity_type || 'unknown',
    registered_address: profile.registered_address || null,
    branch_code: profile.branch_code || null,
    branch_name: profile.branch_name || null,
    verified_status: profile.verified_status || 'unverified',
  };
}

function buildProviderEarningLines({ grossIncome, platformFee = 0, whtRatePercent = 3, withheldAmount = 0, netPayable = 0, metadata = {} }) {
  const gross = round2(grossIncome);
  const fee = round2(platformFee);
  const withheld = round2(withheldAmount);
  const net = round2(netPayable);
  return [
    calculateLine({
      description: 'รายได้ค่าบริการของผู้รับงาน (Gross provider earning)',
      taxable_amount: gross,
      unit_amount: gross,
      vat_rate_percent: 0,
      wht_rate_percent: Number(whtRatePercent || 0),
      wht_amount: withheld,
      total_amount: net,
      metadata: { ...metadata, provider_earning_component: 'gross_income', wht_applied: withheld > 0 },
    }),
    calculateLine({
      description: 'ค่าธรรมเนียม/Commission แพลตฟอร์มที่หักจากรายได้',
      taxable_amount: 0,
      unit_amount: 0,
      vat_rate_percent: 0,
      total_amount: 0,
      metadata: { ...metadata, provider_earning_component: 'platform_fee_display', display_amount: fee },
    }),
  ];
}

function buildWhtCertificateLines({ grossIncome, whtRatePercent, withheldAmount, metadata = {} }) {
  const gross = round2(grossIncome);
  const withheld = round2(withheldAmount);
  return [
    calculateLine({
      description: 'หนังสือรับรองภาษีหัก ณ ที่จ่ายจากรายได้ค่าบริการ',
      taxable_amount: gross,
      unit_amount: gross,
      vat_rate_percent: 0,
      wht_rate_percent: Number(whtRatePercent || 0),
      wht_amount: withheld,
      total_amount: withheld,
      metadata: { ...metadata, document_purpose: 'withholding_certificate', taxable_revenue_type: 'provider_service_income' },
    }),
  ];
}

async function postProviderWhtForEarning(client, {
  sourceEventId,
  sourceEventType,
  providerUserId,
  grossIncomeAmount,
  platformFeeAmount = 0,
  sourcePaymentId = null,
  sourceJobId = null,
  sourceBookingId = null,
  sourceMilestoneId = null,
  actorId = 'provider_wht_service',
  applyBalanceMutation = false,
} = {}) {
  const sourceId = cleanText(sourceEventId, 255);
  if (!sourceId || !providerUserId) return { skipped: true, reason: 'missing_source_or_provider' };
  const gross = round2(grossIncomeAmount);
  if (!(gross > 0)) return { skipped: true, reason: 'non_positive_gross_income' };

  const existing = await client.query(
    `SELECT * FROM tax_withholding_postings WHERE source_event_id = $1 AND provider_user_id = $2::uuid LIMIT 1`,
    [sourceId, String(providerUserId)],
  ).catch(() => ({ rows: [] }));
  if (existing.rows?.[0]) return { posting: existing.rows[0], created: false, withheldAmount: Number(existing.rows[0].withheld_amount || 0), netPayableAmount: Number(existing.rows[0].net_payable_amount || 0) };

  const profile = await getTaxProfile(client, providerUserId);
  const eligibility = providerWhtEligibility(profile);
  const whtRate = await getConfiguredWhtRatePercent(client);
  const withheldAmount = eligibility.eligible ? round2(gross * (whtRate / 100)) : 0;
  const netPayableAmount = round2(gross - round2(platformFeeAmount) - withheldAmount);
  const companySnapshot = await getCompanySnapshot(client);
  const profileSnapshot = buildProviderTaxProfileSnapshot(profile || {});

  let earningDocumentId = null;
  let whtCertificateDocumentId = null;
  const metadata = { source_event_id: sourceId, source_event_type: sourceEventType, source_job_id: sourceJobId, source_booking_id: sourceBookingId, source_milestone_id: sourceMilestoneId };
  const earningDoc = await generateFiscalDocumentDraft(client, {
    sourceEventId: sourceId,
    documentType: 'receipt',
    partyRole: 'provider',
    partyUserId: providerUserId,
    lines: buildProviderEarningLines({ grossIncome: gross, platformFee: platformFeeAmount, whtRatePercent: whtRate, withheldAmount, netPayable: netPayableAmount, metadata }),
    actorType: 'system',
    actorId,
    reason: eligibility.eligible ? 'provider_earning_statement_draft' : `provider_earning_statement_blocked_${eligibility.reason}`,
  });
  earningDocumentId = earningDoc.document?.id || null;
  if (eligibility.eligible && withheldAmount > 0) {
    const certDoc = await generateFiscalDocumentDraft(client, {
      sourceEventId: sourceId,
      documentType: 'withholding_certificate',
      partyRole: 'provider',
      partyUserId: providerUserId,
      lines: buildWhtCertificateLines({ grossIncome: gross, whtRatePercent: whtRate, withheldAmount, metadata }),
      actorType: 'system',
      actorId,
      reason: 'provider_wht_certificate_draft',
    });
    whtCertificateDocumentId = certDoc.document?.id || null;
  }

  const inserted = await client.query(
    `INSERT INTO tax_withholding_postings
       (source_event_id, source_event_type, source_payment_id, source_job_id, source_booking_id, source_milestone_id,
        provider_user_id, gross_income_amount, wht_rate_percent, withheld_amount, net_payable_amount,
        eligibility_status, eligibility_reason, tax_profile_snapshot, withholding_agent_snapshot,
        earning_document_id, wht_certificate_document_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7::uuid,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,$16::uuid,$17::uuid,$18)
     RETURNING *`,
    [
      sourceId,
      sourceEventType,
      sourcePaymentId,
      sourceJobId,
      sourceBookingId,
      sourceMilestoneId,
      String(providerUserId),
      gross,
      whtRate,
      withheldAmount,
      netPayableAmount,
      eligibility.status,
      eligibility.reason,
      JSON.stringify(profileSnapshot),
      JSON.stringify(companySnapshot),
      earningDocumentId,
      whtCertificateDocumentId,
      actorId,
    ],
  );

  if (applyBalanceMutation && withheldAmount > 0) {
    await client.query(
      `UPDATE users SET wallet_balance = GREATEST(0, COALESCE(wallet_balance,0) - $1), updated_at = NOW() WHERE id = $2::uuid`,
      [withheldAmount, String(providerUserId)],
    );
    await client.query(
      `INSERT INTO payment_ledger_audit (id, event_type, payment_id, gateway, job_id, amount, currency, status, bill_no, transaction_no, provider_id, metadata)
       VALUES ($1, 'provider_wht_withheld', $2, 'wallet', $3, $4, 'THB', 'completed', $5, $6, $7::uuid, $8::jsonb)`,
      [
        `L-WHT-${sourceId}-${Date.now()}`,
        sourcePaymentId || sourceId,
        sourceJobId || sourceBookingId || sourcePaymentId || sourceId,
        withheldAmount,
        `WHT-${sourceId}`,
        `T-WHT-${sourceId}-${Date.now()}`,
        String(providerUserId),
        JSON.stringify({ source_event_id: sourceId, source_event_type: sourceEventType, gross_income: gross, wht_rate_percent: whtRate, withheld_amount: withheldAmount, net_payable: netPayableAmount }),
      ],
    );
  }

  return { posting: inserted.rows[0], created: true, withheldAmount, netPayableAmount, eligibility };
}

export {
  buildProviderEarningLines,
  buildWhtCertificateLines,
  getConfiguredWhtRatePercent,
  postProviderWhtForEarning,
  providerWhtEligibility,
};
