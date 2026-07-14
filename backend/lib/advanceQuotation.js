/**
 * Advance Job Quotation — Phase 2
 * Versioning, scoring, expiry, anti-bypass for summary/items.
 */

import {
  evaluateAntiBypassText,
  getAntiBypassTextFilterMode,
} from './antiBypassTextFilter.js';
import { recordAntiBypassReasons } from './antiBypassTelemetry.js';

export const ADVANCE_QUOTE_THEMES = new Set([
  'aqond_classic_corporate',
  'aqond_sme_fast',
  'aqond_creative_portfolio',
  'aqond_technical_sow',
  'aqond_gov_ready',
]);

export const MAX_QUOTE_VERSIONS = 3;
export const QUOTE_DEFAULT_EXPIRY_HOURS = 72;
export const QUOTE_REMINDER_HOURS_BEFORE = 24;

let columnsEnsured = false;
let versionsTableEnsured = false;

export async function ensureAdvanceQuotationColumns(pool) {
  if (columnsEnsured) return;
  await pool.query(`
    ALTER TABLE advance_job_applicants
      ADD COLUMN IF NOT EXISTS quote_theme VARCHAR(64),
      ADD COLUMN IF NOT EXISTS quote_currency VARCHAR(8),
      ADD COLUMN IF NOT EXISTS quote_summary TEXT,
      ADD COLUMN IF NOT EXISTS quote_timeline_days INTEGER,
      ADD COLUMN IF NOT EXISTS quote_valid_until DATE,
      ADD COLUMN IF NOT EXISTS quote_items JSONB,
      ADD COLUMN IF NOT EXISTS quote_total_amount NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS quote_updated_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS quote_version_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS quote_expires_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS quote_reminder_sent_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS quote_status VARCHAR(20) DEFAULT 'active'
  `).catch(() => { });
  await pool.query(`
    ALTER TABLE advance_jobs
      ADD COLUMN IF NOT EXISTS selected_quotation_json JSONB
  `).catch(() => { });
  columnsEnsured = true;
}

export async function ensureQuotationVersionsTable(pool) {
  if (versionsTableEnsured) return;
  await ensureAdvanceQuotationColumns(pool);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS advance_job_quotation_versions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      applicant_id UUID NOT NULL REFERENCES advance_job_applicants(id) ON DELETE CASCADE,
      job_id UUID NOT NULL REFERENCES advance_jobs(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL CHECK (version_number >= 1 AND version_number <= 10),
      proposed_by VARCHAR(10) NOT NULL CHECK (proposed_by IN ('talent', 'employer')),
      quote_theme VARCHAR(64),
      quote_currency VARCHAR(8) DEFAULT 'THB',
      quote_summary TEXT,
      quote_timeline_days INTEGER,
      quote_valid_until DATE,
      quote_items JSONB DEFAULT '[]'::jsonb,
      quote_total_amount NUMERIC(12,2) NOT NULL,
      edit_reason TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => { });
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_quotation_versions_applicant_version
      ON advance_job_quotation_versions(applicant_id, version_number)
  `).catch(() => { });
  versionsTableEnsured = true;
}

export function normalizeAdvanceQuotationInput(input) {
  if (!input || typeof input !== 'object') return null;
  const themeRaw = String(input.quote_theme || input.theme || '').trim();
  const quote_theme = ADVANCE_QUOTE_THEMES.has(themeRaw)
    ? themeRaw
    : 'aqond_classic_corporate';
  const quote_currency = String(input.quote_currency || input.currency || 'THB').trim().toUpperCase().slice(0, 8) || 'THB';
  const quote_summary = String(input.quote_summary || input.summary || '').trim().slice(0, 2000);
  const quote_timeline_days = Math.max(1, Math.min(365, parseInt(input.quote_timeline_days ?? input.timeline_days ?? '0', 10) || 0));
  const quote_valid_until = String(input.quote_valid_until || input.valid_until || '').trim() || null;
  const rawItems = Array.isArray(input.quote_items) ? input.quote_items : (Array.isArray(input.items) ? input.items : []);
  const quote_items = rawItems
    .slice(0, 30)
    .map((x) => {
      const label = String(x?.label || x?.title || '').trim().slice(0, 180);
      const description = String(x?.description || '').trim().slice(0, 1000);
      const qty = Math.max(1, Number(x?.qty || 1) || 1);
      const unit_price = Math.max(0, Number(x?.unit_price ?? x?.unitPrice ?? 0) || 0);
      const total = Math.round(qty * unit_price * 100) / 100;
      if (!label && !description && !unit_price) return null;
      return { label, description, qty, unit_price, total };
    })
    .filter(Boolean);
  const itemSum = quote_items.reduce((s, x) => s + Number(x.total || 0), 0);
  const requested = Math.max(0, Number(input.quote_total_amount ?? input.total_amount ?? input.amount ?? 0) || 0);
  const quote_total_amount = Math.round((itemSum > 0 ? itemSum : requested) * 100) / 100;
  if (!quote_total_amount) return null;
  return {
    quote_theme,
    quote_currency,
    quote_summary,
    quote_timeline_days: quote_timeline_days || null,
    quote_valid_until: quote_valid_until || null,
    quote_items: quote_items.length ? quote_items : [],
    quote_total_amount,
  };
}

/** Compute expiry: earlier of valid_until EOD (Bangkok) or now + default hours */
export function computeQuoteExpiresAt(quotation, fromDate = new Date()) {
  const candidates = [];
  const base = new Date(fromDate);
  candidates.push(new Date(base.getTime() + QUOTE_DEFAULT_EXPIRY_HOURS * 60 * 60 * 1000));
  if (quotation?.quote_valid_until) {
    const d = new Date(`${quotation.quote_valid_until}T23:59:59+07:00`);
    if (!Number.isNaN(d.getTime())) candidates.push(d);
  }
  return new Date(Math.min(...candidates.map((d) => d.getTime())));
}

export function isQuoteExpired(expiresAt) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= Date.now();
}

export async function fetchEnabledAntiBypassRules(pool) {
  try {
    const r = await pool.query(
      `SELECT id, kind, scope, pattern, enabled FROM anti_bypass_rules WHERE enabled = true`,
    );
    return r.rows || [];
  } catch (e) {
    if (e?.code === '42P01') return [];
    throw e;
  }
}

/** Validate summary + item labels/descriptions against anti-bypass rules */
export async function validateQuotationAntiBypass(pool, quotation, context = {}) {
  const filterMode = getAntiBypassTextFilterMode();
  if (filterMode === 'off') return { ok: true };

  const dbRules = await fetchEnabledAntiBypassRules(pool);
  const texts = [];
  if (quotation?.quote_summary) texts.push({ field: 'summary', text: quotation.quote_summary });
  for (const item of quotation?.quote_items || []) {
    if (item.label) texts.push({ field: 'item_label', text: item.label });
    if (item.description) texts.push({ field: 'item_description', text: item.description });
  }

  const allReasons = [];
  const allMatched = [];
  for (const { field, text } of texts) {
    const result = evaluateAntiBypassText(text, { filterMode, dbRules, scope: 'text' });
    if (result.blocked || result.warn) {
      allReasons.push(...(result.reasons || []).map((r) => `${field}:${r}`));
      allMatched.push(...(result.matchedMasked || []));
    }
    if (result.blocked) {
      if (context.userId) {
        recordAntiBypassReasons('advance_quotation', result.reasons).catch?.(() => { });
      }
      return {
        ok: false,
        blocked: true,
        error: 'ไม่สามารถใส่เบอร์โทร ไลน์ หรือช่องทางติดต่อนอกแพลตฟอร์มในใบเสนอราคาได้ — ใช้แชทในแอปแทน',
        reasons: allReasons,
        matchedMasked: allMatched,
        code: 'ANTI_BYPASS_BLOCKED',
      };
    }
  }

  if (allReasons.length && filterMode === 'warn') {
    return { ok: true, warn: true, reasons: allReasons, matchedMasked: allMatched };
  }
  return { ok: true };
}

export function computeTrustScore(applicant) {
  const kyc = String(applicant.kyc_level || '').toLowerCase();
  let kycScore = 0;
  if (kyc.includes('3') || kyc.includes('gold') || kyc === 'level_2') kycScore = 3;
  else if (kyc.includes('2') || kyc.includes('silver') || kyc === 'level_1') kycScore = 2;
  else if (kyc.includes('1') || kyc.includes('basic')) kycScore = 1;
  if (applicant.verified_badge) kycScore = Math.max(kycScore, 2);
  const completed = Math.min(50, parseInt(applicant.completed_jobs_count, 10) || 0);
  const rating = Math.min(5, parseFloat(applicant.rating) || 0);
  return kycScore * 30 + completed * 1.2 + rating * 8;
}

/**
 * Auto-scoring badges: best_value, fastest, most_trusted
 * @param {Array} applicants — must have quotation, kyc, completed_jobs_count, rating
 */
export function computeQuotationScores(applicants) {
  const withQuotes = (applicants || []).filter(
    (a) => a.quotation?.total_amount != null && a.quote_status !== 'expired' && !a.quotation_expired,
  );
  if (withQuotes.length === 0) {
    return { badges: {}, winners: {} };
  }

  const prices = withQuotes.map((a) => Number(a.quotation.total_amount));
  const minPrice = Math.min(...prices);
  const timelines = withQuotes.map((a) => Number(a.quotation.timeline_days || 999));
  const minTimeline = Math.min(...timelines);
  const trustScores = withQuotes.map((a) => computeTrustScore(a));
  const maxTrust = Math.max(...trustScores);

  const badges = {};
  const winners = {
    best_value: null,
    fastest: null,
    most_trusted: null,
  };

  withQuotes.forEach((a, i) => {
    const id = a.user_id || a.id;
    const b = [];
    if (Number(a.quotation.total_amount) === minPrice) {
      b.push('best_value');
      if (!winners.best_value) winners.best_value = id;
    }
    const tl = Number(a.quotation.timeline_days || 999);
    if (tl === minTimeline && tl < 999) {
      b.push('fastest');
      if (!winners.fastest) winners.fastest = id;
    }
    if (trustScores[i] === maxTrust && maxTrust > 0) {
      b.push('most_trusted');
      if (!winners.most_trusted) winners.most_trusted = id;
    }
    badges[id] = b;
  });

  return { badges, winners };
}

export function mapQuotationRow(r) {
  if (r.quote_total_amount == null) return null;
  const expired = isQuoteExpired(r.quote_expires_at) || r.quote_status === 'expired';
  return {
    theme: r.quote_theme || 'aqond_classic_corporate',
    currency: r.quote_currency || 'THB',
    summary: r.quote_summary || '',
    timeline_days: r.quote_timeline_days != null ? Number(r.quote_timeline_days) : null,
    valid_until: r.quote_valid_until || null,
    expires_at: r.quote_expires_at || null,
    items: parseQuoteItems(r.quote_items),
    total_amount: Number(r.quote_total_amount || 0),
    updated_at: r.quote_updated_at || null,
    version: parseInt(r.quote_version_count, 10) || 1,
    status: expired ? 'expired' : (r.quote_status || 'active'),
    expired,
  };
}

function parseQuoteItems(raw) {
  try {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
    return [];
  } catch {
    return [];
  }
}

export async function saveQuotationVersion(pool, {
  applicantId,
  jobId,
  userId,
  versionNumber,
  proposedBy,
  quotation,
  editReason,
  expiresAt,
}) {
  await ensureQuotationVersionsTable(pool);
  await pool.query(
    `UPDATE advance_job_quotation_versions SET status = 'superseded'
     WHERE applicant_id = $1 AND status = 'active'`,
    [applicantId],
  );
  const ins = await pool.query(
    `INSERT INTO advance_job_quotation_versions
      (applicant_id, job_id, user_id, version_number, proposed_by,
       quote_theme, quote_currency, quote_summary, quote_timeline_days, quote_valid_until,
       quote_items, quote_total_amount, edit_reason, status, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::date, $11::jsonb, $12, $13, 'active', $14)
     RETURNING id, version_number, created_at`,
    [
      applicantId,
      jobId,
      userId,
      versionNumber,
      proposedBy,
      quotation.quote_theme,
      quotation.quote_currency,
      quotation.quote_summary || null,
      quotation.quote_timeline_days,
      quotation.quote_valid_until,
      JSON.stringify(quotation.quote_items || []),
      quotation.quote_total_amount,
      editReason ? String(editReason).trim().slice(0, 500) : null,
      expiresAt,
    ],
  );
  return ins.rows[0];
}

export async function updateApplicantQuotation(pool, applicantId, quotation, versionNumber, expiresAt) {
  await pool.query(
    `UPDATE advance_job_applicants
     SET quote_theme = $1, quote_currency = $2, quote_summary = $3, quote_timeline_days = $4,
         quote_valid_until = $5::date, quote_items = $6::jsonb, quote_total_amount = $7,
         quote_updated_at = NOW(), quote_version_count = $8, quote_expires_at = $9,
         quote_status = 'active', quote_reminder_sent_at = NULL
     WHERE id = $10`,
    [
      quotation.quote_theme,
      quotation.quote_currency,
      quotation.quote_summary || null,
      quotation.quote_timeline_days,
      quotation.quote_valid_until,
      JSON.stringify(quotation.quote_items || []),
      quotation.quote_total_amount,
      versionNumber,
      expiresAt,
      applicantId,
    ],
  );
}

export async function getQuotationVersions(pool, applicantId) {
  await ensureQuotationVersionsTable(pool);
  const r = await pool.query(
    `SELECT id, version_number, proposed_by, quote_theme, quote_currency, quote_summary,
            quote_timeline_days, quote_valid_until, quote_items, quote_total_amount,
            edit_reason, status, expires_at, created_at
     FROM advance_job_quotation_versions
     WHERE applicant_id = $1
     ORDER BY version_number ASC`,
    [applicantId],
  );
  return (r.rows || []).map((row) => ({
    id: String(row.id),
    version: row.version_number,
    proposed_by: row.proposed_by,
    edit_reason: row.edit_reason || null,
    status: row.status,
    expires_at: row.expires_at,
    created_at: row.created_at,
    quotation: {
      theme: row.quote_theme,
      currency: row.quote_currency || 'THB',
      summary: row.quote_summary || '',
      timeline_days: row.quote_timeline_days != null ? Number(row.quote_timeline_days) : null,
      valid_until: row.quote_valid_until || null,
      items: parseQuoteItems(row.quote_items),
      total_amount: Number(row.quote_total_amount || 0),
    },
  }));
}
