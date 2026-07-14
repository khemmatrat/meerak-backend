import crypto from 'crypto';
import PDFDocument from 'pdfkit';

let tablesEnsured = false;

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input || ''), 'utf8').digest('hex');
}

function safeText(value, max = 2000) {
  return String(value || '').trim().slice(0, max);
}

function round2(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

function csvCell(value) {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function ensureAdvanceProcurementTables(pool) {
  if (tablesEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS advance_job_procurement_revisions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      job_id UUID NOT NULL REFERENCES advance_jobs(id) ON DELETE CASCADE,
      revision_no INTEGER NOT NULL CHECK (revision_no >= 1),
      actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
      actor_role VARCHAR(20) NOT NULL DEFAULT 'employer',
      winner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      winner_reason TEXT,
      tor_sow_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      price_before_negotiation NUMERIC(12,2),
      price_after_negotiation NUMERIC(12,2),
      package_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      ai_price_recommended NUMERIC(12,2),
      ai_risk_score INTEGER,
      fraud_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
      document_hash VARCHAR(128) NOT NULL,
      prev_hash VARCHAR(128),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(job_id, revision_no)
    )
  `).catch(() => { });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS advance_job_procurement_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      revision_id UUID NOT NULL REFERENCES advance_job_procurement_revisions(id) ON DELETE CASCADE,
      job_id UUID NOT NULL REFERENCES advance_jobs(id) ON DELETE CASCADE,
      document_kind VARCHAR(40) NOT NULL,
      format VARCHAR(10) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      document_hash VARCHAR(128) NOT NULL,
      generated_by UUID REFERENCES users(id) ON DELETE SET NULL,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => { });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS advance_job_procurement_audit_trail (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      job_id UUID NOT NULL REFERENCES advance_jobs(id) ON DELETE CASCADE,
      revision_id UUID REFERENCES advance_job_procurement_revisions(id) ON DELETE SET NULL,
      actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
      actor_role VARCHAR(20) NOT NULL DEFAULT 'system',
      action VARCHAR(80) NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      event_hash VARCHAR(128) NOT NULL,
      prev_hash VARCHAR(128),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => { });
  tablesEnsured = true;
}

function median(nums) {
  if (!nums.length) return 0;
  const a = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

export function computeProcurementAiInsights({ quotations = [], selectedQuotation = null, negotiationBefore, negotiationAfter }) {
  const amounts = quotations
    .map((q) => Number(q?.amount || q?.quote_total_amount || 0))
    .filter((x) => Number.isFinite(x) && x > 0);
  const recPrice = round2(median(amounts));
  const minP = amounts.length ? Math.min(...amounts) : 0;
  const maxP = amounts.length ? Math.max(...amounts) : 0;
  const spreadRatio = minP > 0 ? (maxP - minP) / minP : 0;
  const before = Number(negotiationBefore || selectedQuotation?.amount || 0) || 0;
  const after = Number(negotiationAfter || selectedQuotation?.amount || 0) || 0;
  const negotiationDelta = before > 0 ? Math.abs(after - before) / before : 0;
  const selectedAmount = Number(selectedQuotation?.amount || selectedQuotation?.quote_total_amount || 0) || 0;
  const selectedVsRecommended = recPrice > 0 ? Math.abs(selectedAmount - recPrice) / recPrice : 0;

  let riskScore = 15;
  riskScore += Math.min(35, Math.round(spreadRatio * 100 * 0.6));
  riskScore += Math.min(30, Math.round(negotiationDelta * 100 * 0.7));
  riskScore += Math.min(20, Math.round(selectedVsRecommended * 100 * 0.5));
  if (!amounts.length) riskScore = 70;
  riskScore = Math.max(0, Math.min(100, riskScore));

  const fraudSignals = [];
  if (spreadRatio > 0.6) fraudSignals.push('wide_price_spread');
  if (negotiationDelta > 0.3) fraudSignals.push('large_negotiation_delta');
  if (selectedVsRecommended > 0.4) fraudSignals.push('selected_price_far_from_ai_recommendation');
  if (!selectedAmount) fraudSignals.push('winner_without_selected_price');

  return {
    recommended_price: recPrice,
    risk_score: riskScore,
    fraud_signals: fraudSignals,
    explain: {
      quote_count: amounts.length,
      min_price: round2(minP),
      max_price: round2(maxP),
      price_spread_ratio: round2(spreadRatio),
      negotiation_delta_ratio: round2(negotiationDelta),
      selected_vs_recommended_ratio: round2(selectedVsRecommended),
    },
  };
}

export function buildProcurementPayload({
  job,
  quotations,
  quoteVersions,
  winner,
  winnerReason,
  torSowSnapshot,
  priceBeforeNegotiation,
  priceAfterNegotiation,
  aiInsights,
}) {
  return {
    generated_at: new Date().toISOString(),
    job: {
      id: String(job.id),
      title: safeText(job.title, 200),
      category: safeText(job.category, 120),
      min_budget: Number(job.min_budget || 0),
      max_budget: Number(job.max_budget || 0),
      status: String(job.status || ''),
      employer_id: String(job.employer_id || ''),
    },
    tor_sow_snapshot: {
      title: safeText(torSowSnapshot?.title || job.title, 200),
      objective: safeText(torSowSnapshot?.objective || job.description, 3000),
      scope: safeText(torSowSnapshot?.scope || job.scope, 5000),
      deliverables: Array.isArray(torSowSnapshot?.deliverables)
        ? torSowSnapshot.deliverables.map((x) => safeText(x, 500)).filter(Boolean).slice(0, 50)
        : [],
      timeline_days: Number(torSowSnapshot?.timeline_days || job.duration_days || 0),
      extra_notes: safeText(torSowSnapshot?.extra_notes, 3000),
    },
    all_quotations: quotations.map((q) => ({
      applicant_id: String(q.applicant_id || ''),
      user_id: String(q.user_id || ''),
      talent_name: safeText(q.full_name || 'Talent', 180),
      currency: safeText(q.quote_currency || 'THB', 8),
      amount: round2(q.amount || q.quote_total_amount),
      timeline_days: Number(q.quote_timeline_days || 0) || null,
      version: Number(q.quote_version_count || 1),
      status: safeText(q.quote_status || 'active', 30),
      updated_at: q.quote_updated_at || null,
      kyc_level: safeText(q.kyc_level || '', 30),
      rating: Number(q.rating || 0),
      completed_jobs_count: Number(q.completed_jobs_count || 0),
    })),
    quote_versions: quoteVersions,
    winner_selection: {
      winner_user_id: winner?.user_id ? String(winner.user_id) : null,
      winner_name: winner?.full_name || null,
      reason: safeText(winnerReason, 4000),
    },
    negotiation: {
      price_before: round2(priceBeforeNegotiation),
      price_after: round2(priceAfterNegotiation),
      savings_amount: round2(Number(priceBeforeNegotiation || 0) - Number(priceAfterNegotiation || 0)),
      savings_pct:
        Number(priceBeforeNegotiation || 0) > 0
          ? round2(((Number(priceBeforeNegotiation || 0) - Number(priceAfterNegotiation || 0)) / Number(priceBeforeNegotiation || 1)) * 100)
          : 0,
    },
    ai: aiInsights,
  };
}

function linesToCsv(lines) {
  return lines.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function buildProcurementCsv(payload, revision) {
  const q = payload?.all_quotations || [];
  const rows = [
    ['revision_id', revision.id],
    ['revision_no', revision.revision_no],
    ['document_hash', revision.document_hash],
    ['created_at', revision.created_at],
    ['job_id', payload?.job?.id || ''],
    ['job_title', payload?.job?.title || ''],
    ['winner_user_id', payload?.winner_selection?.winner_user_id || ''],
    ['winner_reason', payload?.winner_selection?.reason || ''],
    ['price_before_negotiation', payload?.negotiation?.price_before ?? ''],
    ['price_after_negotiation', payload?.negotiation?.price_after ?? ''],
    ['savings_amount', payload?.negotiation?.savings_amount ?? ''],
    ['savings_pct', payload?.negotiation?.savings_pct ?? ''],
    ['ai_recommended_price', payload?.ai?.recommended_price ?? ''],
    ['ai_risk_score', payload?.ai?.risk_score ?? ''],
    ['fraud_signals', (payload?.ai?.fraud_signals || []).join('|')],
    [],
    ['quotation_user_id', 'talent_name', 'amount', 'currency', 'timeline_days', 'version', 'status', 'updated_at'],
    ...q.map((item) => [
      item.user_id,
      item.talent_name,
      item.amount,
      item.currency,
      item.timeline_days ?? '',
      item.version,
      item.status,
      item.updated_at || '',
    ]),
  ];
  return linesToCsv(rows);
}

export function buildProcurementAgencyJson(payload, revision, opts = {}) {
  const agencyForm = String(opts.agencyForm || 'th_gov_procurement_v1').trim().toLowerCase();
  const quotations = Array.isArray(payload?.all_quotations) ? payload.all_quotations : [];
  return {
    schema_version: agencyForm,
    generated_at: new Date().toISOString(),
    revision: {
      revision_id: String(revision?.id || ''),
      revision_no: Number(revision?.revision_no || 0),
      created_at: revision?.created_at || null,
      document_hash: String(revision?.document_hash || ''),
      prev_hash: revision?.prev_hash ? String(revision.prev_hash) : null,
    },
    project: {
      job_id: String(payload?.job?.id || ''),
      title: safeText(payload?.job?.title || '', 200),
      category: safeText(payload?.job?.category || '', 120),
      status: safeText(payload?.job?.status || '', 40),
      budget_min: Number(payload?.job?.min_budget || 0),
      budget_max: Number(payload?.job?.max_budget || 0),
    },
    tor_sow: {
      title: safeText(payload?.tor_sow_snapshot?.title || '', 200),
      objective: safeText(payload?.tor_sow_snapshot?.objective || '', 4000),
      scope: safeText(payload?.tor_sow_snapshot?.scope || '', 8000),
      deliverables: Array.isArray(payload?.tor_sow_snapshot?.deliverables)
        ? payload.tor_sow_snapshot.deliverables.map((x) => safeText(x, 500)).filter(Boolean)
        : [],
      timeline_days: Number(payload?.tor_sow_snapshot?.timeline_days || 0),
      extra_notes: safeText(payload?.tor_sow_snapshot?.extra_notes || '', 4000),
    },
    procurement: {
      quotation_count: quotations.length,
      quotations: quotations.map((q, idx) => ({
        rank: idx + 1,
        user_id: String(q?.user_id || ''),
        talent_name: safeText(q?.talent_name || '', 200),
        amount: round2(q?.amount || 0),
        currency: safeText(q?.currency || 'THB', 10),
        timeline_days: q?.timeline_days != null ? Number(q.timeline_days) : null,
        version: Number(q?.version || 1),
        status: safeText(q?.status || 'active', 40),
        updated_at: q?.updated_at || null,
        kyc_level: safeText(q?.kyc_level || '', 30),
        rating: q?.rating != null ? Number(q.rating) : null,
        completed_jobs_count: q?.completed_jobs_count != null ? Number(q.completed_jobs_count) : null,
      })),
      winner_selection: {
        winner_user_id: payload?.winner_selection?.winner_user_id || null,
        winner_name: payload?.winner_selection?.winner_name || null,
        reason: payload?.winner_selection?.reason || '',
      },
      negotiation: {
        price_before: payload?.negotiation?.price_before ?? null,
        price_after: payload?.negotiation?.price_after ?? null,
        savings_amount: payload?.negotiation?.savings_amount ?? null,
        savings_pct: payload?.negotiation?.savings_pct ?? null,
      },
      ai_summary: {
        recommended_price: payload?.ai?.recommended_price ?? null,
        risk_score: payload?.ai?.risk_score ?? null,
        fraud_signals: Array.isArray(payload?.ai?.fraud_signals) ? payload.ai.fraud_signals : [],
        explain: payload?.ai?.explain || {},
      },
    },
  };
}

export async function buildProcurementPdfBuffer(payload, revision) {
  const doc = new PDFDocument({ size: 'A4', margin: 36 });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    doc.on('end', resolve);
    doc.on('error', reject);
  });
  doc.fontSize(14).text('Procurement Package');
  doc.moveDown(0.5);
  doc.fontSize(10).text(`Revision: #${revision.revision_no} (${revision.id})`);
  doc.text(`Timestamp: ${revision.created_at}`);
  doc.text(`Document hash: ${revision.document_hash}`);
  doc.moveDown();
  doc.fontSize(11).text('TOR / SOW Snapshot', { underline: true });
  doc.fontSize(10).text(`Title: ${payload?.tor_sow_snapshot?.title || ''}`);
  doc.text(`Objective: ${payload?.tor_sow_snapshot?.objective || ''}`);
  doc.text(`Scope: ${payload?.tor_sow_snapshot?.scope || ''}`);
  doc.moveDown(0.5);
  doc.fontSize(11).text('Winner Selection', { underline: true });
  doc.fontSize(10).text(`Winner user: ${payload?.winner_selection?.winner_user_id || '-'}`);
  doc.text(`Reason: ${payload?.winner_selection?.reason || '-'}`);
  doc.moveDown(0.5);
  doc.fontSize(11).text('Negotiation', { underline: true });
  doc.fontSize(10).text(`Before: ${payload?.negotiation?.price_before ?? '-'}`);
  doc.text(`After: ${payload?.negotiation?.price_after ?? '-'}`);
  doc.text(`Savings: ${payload?.negotiation?.savings_amount ?? '-'} (${payload?.negotiation?.savings_pct ?? 0}%)`);
  doc.moveDown(0.5);
  doc.fontSize(11).text('AI Risk Summary', { underline: true });
  doc.fontSize(10).text(`Recommended price: ${payload?.ai?.recommended_price ?? '-'}`);
  doc.text(`Risk score: ${payload?.ai?.risk_score ?? '-'}`);
  doc.text(`Fraud signals: ${(payload?.ai?.fraud_signals || []).join(', ') || '-'}`);
  doc.moveDown(0.5);
  doc.fontSize(11).text('All Quotations', { underline: true });
  (payload?.all_quotations || []).slice(0, 100).forEach((item, idx) => {
    doc.fontSize(9).text(
      `${idx + 1}. ${item.talent_name || item.user_id} | ${item.amount} ${item.currency} | ${item.timeline_days || '-'} days | v${item.version}`,
    );
  });
  doc.end();
  await done;
  return Buffer.concat(chunks);
}

async function appendProcurementAudit(pool, {
  jobId,
  revisionId,
  actorId,
  actorRole,
  action,
  payload,
}) {
  const prev = await pool.query(
    `SELECT event_hash FROM advance_job_procurement_audit_trail
     WHERE job_id = $1
     ORDER BY created_at DESC LIMIT 1`,
    [jobId],
  );
  const prevHash = prev.rows?.[0]?.event_hash || null;
  const eventHash = sha256Hex(JSON.stringify({
    jobId: String(jobId),
    revisionId: revisionId ? String(revisionId) : null,
    action: String(action),
    payload,
    prevHash,
  }));
  await pool.query(
    `INSERT INTO advance_job_procurement_audit_trail
      (job_id, revision_id, actor_id, actor_role, action, payload, event_hash, prev_hash)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
    [jobId, revisionId || null, actorId || null, actorRole || 'system', action, JSON.stringify(payload || {}), eventHash, prevHash],
  );
}

export async function createProcurementRevision(pool, {
  job,
  quotations,
  quoteVersions,
  winner,
  winnerReason,
  torSowSnapshot,
  priceBeforeNegotiation,
  priceAfterNegotiation,
  actorId,
  actorRole = 'employer',
}) {
  await ensureAdvanceProcurementTables(pool);
  const prev = await pool.query(
    `SELECT id, revision_no, document_hash
     FROM advance_job_procurement_revisions
     WHERE job_id = $1
     ORDER BY revision_no DESC LIMIT 1`,
    [job.id],
  );
  const prevHash = prev.rows?.[0]?.document_hash || null;
  const nextRevisionNo = (parseInt(prev.rows?.[0]?.revision_no, 10) || 0) + 1;

  const selectedAmount = winner ? Number(winner.amount || winner.quote_total_amount || 0) : 0;
  const ai = computeProcurementAiInsights({
    quotations,
    selectedQuotation: winner ? { ...winner, amount: selectedAmount } : null,
    negotiationBefore: priceBeforeNegotiation,
    negotiationAfter: priceAfterNegotiation,
  });
  const payload = buildProcurementPayload({
    job,
    quotations,
    quoteVersions,
    winner,
    winnerReason,
    torSowSnapshot,
    priceBeforeNegotiation,
    priceAfterNegotiation,
    aiInsights: ai,
  });
  const documentHash = sha256Hex(JSON.stringify({ payload, prevHash, revision_no: nextRevisionNo }));

  const ins = await pool.query(
    `INSERT INTO advance_job_procurement_revisions
      (job_id, revision_no, actor_id, actor_role, winner_user_id, winner_reason,
       tor_sow_snapshot, price_before_negotiation, price_after_negotiation,
       package_payload, ai_price_recommended, ai_risk_score, fraud_signals, document_hash, prev_hash)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10::jsonb, $11, $12, $13::jsonb, $14, $15)
     RETURNING id, revision_no, created_at, document_hash, prev_hash`,
    [
      job.id,
      nextRevisionNo,
      actorId || null,
      actorRole,
      winner?.user_id || null,
      winnerReason || null,
      JSON.stringify(payload.tor_sow_snapshot || {}),
      priceBeforeNegotiation != null ? round2(priceBeforeNegotiation) : null,
      priceAfterNegotiation != null ? round2(priceAfterNegotiation) : null,
      JSON.stringify(payload),
      ai.recommended_price || null,
      ai.risk_score ?? null,
      JSON.stringify(ai.fraud_signals || []),
      documentHash,
      prevHash,
    ],
  );
  const row = ins.rows[0];
  await appendProcurementAudit(pool, {
    jobId: job.id,
    revisionId: row.id,
    actorId,
    actorRole,
    action: 'PROCUREMENT_REVISION_CREATED',
    payload: {
      revision_no: row.revision_no,
      document_hash: row.document_hash,
      winner_user_id: winner?.user_id || null,
      risk_score: ai.risk_score,
    },
  });
  return {
    revision: row,
    payload,
    ai,
  };
}

export async function recordProcurementDocument(pool, {
  revisionId,
  jobId,
  kind,
  format,
  fileName,
  content,
  actorId,
}) {
  await ensureAdvanceProcurementTables(pool);
  const documentHash = sha256Hex(content);
  await pool.query(
    `INSERT INTO advance_job_procurement_documents
      (revision_id, job_id, document_kind, format, file_name, document_hash, generated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [revisionId, jobId, kind, format, fileName, documentHash, actorId || null],
  );
  await appendProcurementAudit(pool, {
    jobId,
    revisionId,
    actorId,
    actorRole: actorId ? 'employer' : 'system',
    action: 'PROCUREMENT_DOCUMENT_EXPORTED',
    payload: {
      format,
      file_name: fileName,
      document_hash: documentHash,
    },
  });
  return { documentHash };
}
