/**
 * Task 19E — In-memory canonical drift metrics + bounded audit ring (read-only ingestion).
 * Task 22 extends controlled-read ingestion with intent cutover program + phase tagging.
 * No DML; no impact on projection/presenter semantics; rollback-safe additive telemetry.
 *
 * Intentionally does not import paymentCanonicalShadow.js (projection imports both).
 */

import { intentCutoverPhaseMetricSlug } from './paymentIntentCutover.js';

/** Mirror CANONICAL_SHADOW_CLASSIFICATION string values only. */
const CLS = Object.freeze({
  match: 'match',
  status_mismatch: 'status_mismatch',
  amount_mismatch: 'amount_mismatch',
  missing_canonical: 'missing_canonical',
  missing_gateway: 'missing_gateway',
  transition_gap: 'transition_gap',
  orphan_attempt: 'orphan_attempt',
  duplicate_attempt_anchor: 'duplicate_attempt_anchor',
});

const MAX_RECENT = 200;

/** @type {Record<string, number>} */
const COUNTERS_IN = {};

function bump(key, n = 1) {
  COUNTERS_IN[key] = (COUNTERS_IN[key] || 0) + n;
}

/**
 * Sorted unique deterministic strings only.
 * @param {readonly unknown[]} xs
 */
function normReasonCodes(xs) {
  const u = [...new Set((xs || []).filter(Boolean).map((x) => String(x)))];
  u.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return u;
}

/** @type {unknown[]} */
const RECENT_RING = [];

function pushRecent(entry) {
  RECENT_RING.push(entry);
  if (RECENT_RING.length > MAX_RECENT) {
    RECENT_RING.splice(0, RECENT_RING.length - MAX_RECENT);
  }
}

/** @type {Record<string, string>} */
const SHADOW_KEY = {
  [CLS.match]: 'canonical_shadow_match',
  [CLS.status_mismatch]: 'canonical_shadow_status_mismatch',
  [CLS.amount_mismatch]: 'canonical_shadow_amount_mismatch',
  [CLS.missing_canonical]: 'canonical_shadow_missing_canonical',
  [CLS.missing_gateway]: 'canonical_shadow_missing_gateway',
  [CLS.transition_gap]: 'canonical_shadow_transition_gap',
  [CLS.orphan_attempt]: 'canonical_shadow_orphan_attempt',
  [CLS.duplicate_attempt_anchor]: 'canonical_shadow_duplicate_anchor',
};

/**
 * Controlled-read fallback reason taxonomy (required names).
 *
 * @param {{ ok?: boolean, reason?: string|null }|null|undefined} completeness
 * @param {string|null|undefined} shadowClassification
 * @param {{ load_error?: boolean }|null|undefined} extra
 */
export function deriveControlledReadFallbackReasonCodes(completeness, shadowClassification, extra = null) {
  if (extra?.load_error) return normReasonCodes(['incomplete_bundle']);
  if (!completeness?.ok) {
    const r = completeness?.reason;
    if (r === 'missing_attempt_anchor') return normReasonCodes(['missing_attempt']);
    if (r === 'duplicate_attempt_anchor') return normReasonCodes(['duplicate_anchor']);
    if (r === 'transition_gap') return normReasonCodes(['transition_gap']);
    return normReasonCodes(['incomplete_bundle']);
  }
  const s = shadowClassification ? String(shadowClassification) : '';
  if (s === CLS.status_mismatch) return normReasonCodes(['status_mismatch']);
  if (s === CLS.amount_mismatch) return normReasonCodes(['amount_mismatch']);
  if (s === CLS.duplicate_attempt_anchor) return normReasonCodes(['duplicate_anchor']);
  if (s === CLS.transition_gap) return normReasonCodes(['transition_gap']);
  return normReasonCodes(['incomplete_bundle']);
}

export function resetCanonicalAuditMetricsForTests() {
  for (const k of Object.keys(COUNTERS_IN)) delete COUNTERS_IN[k];
  RECENT_RING.length = 0;
}

/**
 * Canonical shadow audit observation (projection or presenter leg).
 *
 * @param {{
 *   source?: 'shadow_projection'|'shadow_ux',
 *   gateway_transaction_id: string,
 *   payment_id: string,
 *   classification: string,
 *   reason_codes?: readonly unknown[],
 *   fallback_used?: boolean,
 *   trace_id?: string|null,
 *   created_at_ms?: number,
 * }} payload
 */
export function ingestCanonicalShadowAudit(payload) {
  const classification = String(payload.classification || '');
  const ctrKey = SHADOW_KEY[classification] || 'canonical_shadow_other';
  bump(ctrKey);
  bump('total_shadow_audits');
  bump('canonical_audit_records');

  const source = payload.source === 'shadow_ux' ? 'shadow_ux' : 'shadow_projection';

  pushRecent({
    trace_id: payload.trace_id != null && String(payload.trace_id).trim() !== '' ? String(payload.trace_id) : null,
    payment_id: String(payload.payment_id || ''),
    gateway_transaction_id: String(payload.gateway_transaction_id || ''),
    classification,
    reason_codes: normReasonCodes(payload.reason_codes || []),
    fallback_used: payload.fallback_used === true,
    created_at_ms: Number.isFinite(Number(payload.created_at_ms)) ? Math.round(Number(payload.created_at_ms)) : Date.now(),
    source,
  });
}

/**
 * Controlled-read lane outcome (canonical-first migration).
 *
 * @param {{
 *   gateway_transaction_id: string,
 *   payment_id: string,
 *   lane: 'canonical'|'gateway',
 *   completeness?: { ok: boolean, reason?: string|null } | null,
 *   shadow_classification?: string|null,
 *   trace_id?: string|null,
 *   created_at_ms?: number,
 *   load_error?: boolean,
 *   read_program?: 'intent_cutover'|'canonical_reads'|'off'|null,
 *   cutover_phase?: string|null,
 * }} inp
 */
export function ingestControlledReadDecision(inp) {
  const gw = String(inp.gateway_transaction_id || '');
  const pay = String(inp.payment_id || '');
  const lane = inp.lane;
  const ms = Number.isFinite(Number(inp.created_at_ms)) ? Math.round(Number(inp.created_at_ms)) : Date.now();
  const program = inp.read_program != null ? String(inp.read_program).trim().toLowerCase() : '';
  const phaseLbl = inp.cutover_phase != null ? String(inp.cutover_phase).trim().toLowerCase() : '';

  if (lane === 'canonical') {
    bump('canonical_controlled_read_success');
    bump('canonical_audit_records');
    if (program === 'intent_cutover') {
      bump('intent_cutover_read_decisions_total');
      bump(`intent_cutover_phase__${intentCutoverPhaseMetricSlug(phaseLbl)}`);
      bump('intent_cutover_canonical_lane_success');
    }
    pushRecent({
      trace_id: inp.trace_id != null && String(inp.trace_id).trim() !== '' ? String(inp.trace_id) : null,
      payment_id: pay,
      gateway_transaction_id: gw,
      classification: 'canonical_controlled_read_success',
      reason_codes: [],
      fallback_used: false,
      created_at_ms: ms,
      source: 'controlled_read',
      read_program: program || null,
      cutover_phase: phaseLbl || null,
    });
    return;
  }

  bump('canonical_controlled_read_fallback');
  bump('canonical_audit_records');
  if (program === 'intent_cutover') {
    bump('intent_cutover_read_decisions_total');
    bump(`intent_cutover_phase__${intentCutoverPhaseMetricSlug(phaseLbl)}`);
    bump('intent_cutover_gateway_lane_fallback');
  }
  const rc = deriveControlledReadFallbackReasonCodes(inp.completeness ?? null, inp.shadow_classification ?? null, {
    load_error: inp.load_error === true,
  });
  pushRecent({
    trace_id: inp.trace_id != null && String(inp.trace_id).trim() !== '' ? String(inp.trace_id) : null,
    payment_id: pay,
    gateway_transaction_id: gw,
    classification: 'canonical_controlled_read_fallback',
    reason_codes: rc,
    fallback_used: true,
    created_at_ms: ms,
    source: 'controlled_read',
    read_program: program || null,
    cutover_phase: phaseLbl || null,
  });
}

/** Test / diagnostics — bounded ring length (max {@link MAX_RECENT}). */
export function getCanonicalAuditRingSize() {
  return RECENT_RING.length;
}

/** Admin JSON (safe — no provider secrets). */
export function getCanonicalAuditAdminResponse() {
  const m = COUNTERS_IN.canonical_shadow_match || 0;
  const mismatchesAgg =
    (COUNTERS_IN.canonical_shadow_status_mismatch || 0) +
    (COUNTERS_IN.canonical_shadow_amount_mismatch || 0) +
    (COUNTERS_IN.canonical_shadow_transition_gap || 0) +
    (COUNTERS_IN.canonical_shadow_duplicate_anchor || 0) +
    (COUNTERS_IN.canonical_shadow_missing_canonical || 0) +
    (COUNTERS_IN.canonical_shadow_missing_gateway || 0) +
    (COUNTERS_IN.canonical_shadow_orphan_attempt || 0) +
    (COUNTERS_IN.canonical_shadow_other || 0);

  /** Newest first — uses observation wall-clock ms only (not DB created_at). */
  const recent = [...RECENT_RING].sort((a, b) => b.created_at_ms - a.created_at_ms).slice(0, 80);

  /** @type {Record<string, number>} */
  const statsFlat = {
    matches: m + (COUNTERS_IN.canonical_controlled_read_success || 0),
    mismatches: mismatchesAgg,
    fallback_count: COUNTERS_IN.canonical_controlled_read_fallback || 0,
    total_audits: COUNTERS_IN.canonical_audit_records || 0,
    canonical_shadow_match: m,
    canonical_shadow_status_mismatch: COUNTERS_IN.canonical_shadow_status_mismatch || 0,
    canonical_shadow_amount_mismatch: COUNTERS_IN.canonical_shadow_amount_mismatch || 0,
    canonical_shadow_transition_gap: COUNTERS_IN.canonical_shadow_transition_gap || 0,
    canonical_shadow_duplicate_anchor: COUNTERS_IN.canonical_shadow_duplicate_anchor || 0,
    canonical_shadow_missing_canonical: COUNTERS_IN.canonical_shadow_missing_canonical || 0,
    canonical_shadow_missing_gateway: COUNTERS_IN.canonical_shadow_missing_gateway || 0,
    canonical_shadow_orphan_attempt: COUNTERS_IN.canonical_shadow_orphan_attempt || 0,
    canonical_shadow_other: COUNTERS_IN.canonical_shadow_other || 0,
    canonical_controlled_read_fallback: COUNTERS_IN.canonical_controlled_read_fallback || 0,
    canonical_controlled_read_success: COUNTERS_IN.canonical_controlled_read_success || 0,
    total_shadow_audits: COUNTERS_IN.total_shadow_audits || 0,
    total_controlled_read_decisions:
      (COUNTERS_IN.canonical_controlled_read_fallback || 0) + (COUNTERS_IN.canonical_controlled_read_success || 0),
    intent_cutover_read_decisions_total: COUNTERS_IN.intent_cutover_read_decisions_total || 0,
    intent_cutover_canonical_lane_success: COUNTERS_IN.intent_cutover_canonical_lane_success || 0,
    intent_cutover_gateway_lane_fallback: COUNTERS_IN.intent_cutover_gateway_lane_fallback || 0,
  };

  /** @type {Record<string, number>} */
  const intent_cutover_phases = {};
  for (const [k, v] of Object.entries(COUNTERS_IN)) {
    if (!k.startsWith('intent_cutover_phase__')) continue;
    const slug = k.slice('intent_cutover_phase__'.length);
    intent_cutover_phases[slug] = v;
  }

  return {
    success: true,
    stats: statsFlat,
    intent_cutover_phase_counters: intent_cutover_phases,
    recent: recent.map((r) => ({
      trace_id: r.trace_id,
      payment_id: r.payment_id,
      gateway_transaction_id: r.gateway_transaction_id,
      classification: r.classification,
      reason_codes: [...r.reason_codes],
      fallback_used: r.fallback_used,
      created_at_ms: r.created_at_ms,
      read_program: r.read_program != null ? String(r.read_program) : null,
      cutover_phase: r.cutover_phase != null ? String(r.cutover_phase) : null,
    })),
  };
}
