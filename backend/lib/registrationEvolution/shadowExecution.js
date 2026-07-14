/**
 * Phase 3.1 — Shadow execution scaffold.
 *
 * Allows V1 signup requests to be asynchronously mirrored into V2 signup
 * intents for offline validation. NEVER affects the V1 response.
 *
 * SAFETY CONTRACT:
 * - Default noop (ENABLE_SIGNUP_SHADOW_EXECUTION env must be explicitly true)
 * - Fire-and-forget only — dispatched via setImmediate
 * - Every code path wrapped in try/catch — NEVER throws to caller
 * - NEVER creates JWT / session / user row
 * - NEVER mutates V1 response or request
 * - NEVER writes to V1 tables
 */

import { parseEnvBoolean } from './featureFlags.js';
import { SIGNUP_FLOW_VERSION } from './signupIntentConstants.js';
import { emitIntentMetric } from './signupIntentMetrics.js';

const SHADOW_EVENT = 'signup_shadow_execution';

// ─── gating helpers ────────────────────────────────────────────────

function isShadowExecutionEnabled() {
  return parseEnvBoolean(process.env.ENABLE_SIGNUP_SHADOW_EXECUTION, false);
}

/**
 * Sample-rate gate.
 * `SIGNUP_SHADOW_SAMPLE_RATE_PERCENT` — integer 0-100, default 0 (disabled).
 * Returns true when a random roll falls within the configured percentage.
 */
function passesSampleRate() {
  const raw = parseInt(process.env.SIGNUP_SHADOW_SAMPLE_RATE_PERCENT || '', 10);
  const pct = Number.isFinite(raw) ? Math.max(0, Math.min(raw, 100)) : 0;
  if (pct <= 0) return false;
  if (pct >= 100) return true;
  return Math.random() * 100 < pct;
}

// ─── stdout logging (opt-in) ───────────────────────────────────────

function emitShadowStdout(payload) {
  try {
    if (!parseEnvBoolean(process.env.SIGNUP_SHADOW_EXECUTION_STDOUT, false)) return;
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      event: SHADOW_EVENT,
      flow_version: SIGNUP_FLOW_VERSION,
      ...payload,
    }));
  } catch (_) { /* noop */ }
}

// ─── shadow context extraction ─────────────────────────────────────

/**
 * Extracts a minimal, redacted context from a V1 register request.
 * Only captures fields needed for intent creation — no password, no firebase_uid.
 *
 * @param {import('express').Request} req
 * @returns {Record<string, unknown>}
 */
function extractShadowContext(req) {
  try {
    const body = req?.body || {};
    const phone = body.phone != null ? String(body.phone).trim() : '';
    const ua = typeof req?.headers?.['user-agent'] === 'string'
      ? req.headers['user-agent'].slice(0, 120)
      : '';

    const platform =
      (typeof req?.headers?.['x-client-platform'] === 'string' ? req.headers['x-client-platform'] : '') ||
      (typeof req?.headers?.['x-aqond-client-platform'] === 'string' ? req.headers['x-aqond-client-platform'] : '');

    const embedded =
      req?.headers?.['x-embedded-browser'] === '1' ||
      req?.headers?.['x-signup-embedded-browser'] === '1' ||
      body.embedded_browser === true;

    return {
      phone_last4: phone.length >= 4 ? phone.slice(-4) : '****',
      phone_length: phone.length,
      source_platform: String(platform || '').trim().toLowerCase().slice(0, 32) || null,
      embedded_browser: Boolean(embedded),
      ua_preview: ua.slice(0, 60),
      role: body.role || 'user',
      has_referral: Boolean(body.referral_code || body.ref || body.referralCode),
    };
  } catch (_) {
    return { extraction_error: true };
  }
}

// ─── core shadow executor ──────────────────────────────────────────

/**
 * Internal async worker — runs inside setImmediate, fully isolated.
 *
 * @param {Record<string, unknown>} ctx — shadow context from extractShadowContext
 * @param {{ pool?: import('pg').Pool }} deps
 */
async function executeShadow(ctx, deps) {
  const t0 = Date.now();
  let outcome = 'unknown';

  try {
    if (!deps?.pool) {
      outcome = 'no_pool';
      return;
    }

    const { signupIntentHttpCreate } = await import('./signupIntentService.js');

    const shadowReq = {
      body: {
        phone: `shadow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        source_platform: ctx.source_platform || 'shadow',
        embedded_browser: ctx.embedded_browser || false,
        flow_version: `shadow-${SIGNUP_FLOW_VERSION}`,
      },
      headers: {},
      params: {},
      query: {},
    };

    const result = await signupIntentHttpCreate(deps.pool, shadowReq);
    outcome = result?.status === 201 ? 'created'
      : result?.status === 404 ? 'feature_off'
        : `status_${result?.status || 'null'}`;

  } catch (e) {
    outcome = 'error';
    emitShadowStdout({ outcome, error: e?.message?.slice(0, 200) });
  } finally {
    const elapsed = Date.now() - t0;
    emitShadowStdout({ outcome, elapsed_ms: elapsed, ctx });
    emitIntentMetric('shadow_execution', { outcome, elapsed_ms: elapsed });
  }
}

// ─── public API ────────────────────────────────────────────────────

/**
 * Fire-and-forget shadow execution.
 *
 * Called from V1 register vicinity (or orchestrator hook) to asynchronously
 * mirror a signup attempt into V2 intents for offline comparison.
 *
 * GUARANTEES:
 * - Never throws (returns immediately)
 * - Never awaits (dispatched via setImmediate)
 * - Never mutates req/res
 * - Noop when flag off or sample-rate misses
 *
 * @param {import('express').Request} req — V1 request (read-only access)
 * @param {{ pool?: import('pg').Pool }} deps
 */
export function runSignupShadowExecution(req, deps) {
  try {
    if (!isShadowExecutionEnabled()) return;
    if (!passesSampleRate()) return;

    const ctx = extractShadowContext(req);

    setImmediate(() => {
      executeShadow(ctx, deps).catch(() => { /* absolute fail-silent */ });
    });
  } catch (_) {
    /* absolute fail-open — must never propagate to V1 caller */
  }
}

// ─── Phase 3.2 — response-tail safe wrapper ───────────────────────

/**
 * Safe wrapper for server.js response-tail shadow tap.
 *
 * Accepts pre-sanitized metadata (no raw req object — caller is responsible
 * for passing only safe fields). Internally dispatches via setImmediate.
 *
 * GUARANTEES:
 * - Synchronous — returns immediately, never awaits
 * - Never throws — triple try/catch isolation
 * - Never mutates caller state
 * - Noop when ENABLE_SIGNUP_SHADOW_EXECUTION is off or sample-rate misses
 *
 * @param {{ phoneLast4?: string, platform?: string, embeddedBrowser?: boolean, registrationOutcome?: string, clientAttempt?: number }} meta
 * @param {{ pool?: import('pg').Pool }} deps
 */
export function runSignupShadowExecutionSafe(meta, deps) {
  try {
    if (!isShadowExecutionEnabled()) return;
    if (!passesSampleRate()) return;

    const t0 = Date.now();
    const ctx = {
      phone_last4: meta?.phoneLast4 || '****',
      source_platform: meta?.platform || null,
      embedded_browser: Boolean(meta?.embeddedBrowser),
      registration_outcome: meta?.registrationOutcome || 'unknown',
      client_attempt: meta?.clientAttempt,
      tap: 'response_tail',
    };

    setImmediate(() => {
      try {
        const dispatchMs = Date.now() - t0;
        executeShadow(ctx, deps).catch(() => { /* absolute fail-silent */ });
        emitShadowStdout({ kind: 'dispatch', shadow_dispatch_ms: dispatchMs, ctx });
      } catch (_) { /* fail-silent */ }
    });
  } catch (_) {
    /* absolute fail-open — must never propagate to V1 caller */
  }
}

// ─── Phase 3.3 — Drift detection + comparison ─────────────────────

const SHADOW_COMPARISON_VERSION = 'shadow_compare_v1';

/**
 * @typedef {Object} ShadowExpected
 * @property {string}  outcome             — V1 registration outcome (e.g. 'new_user_created')
 * @property {string}  [lane]              — traffic lane tag (e.g. 'v1_default')
 * @property {boolean} [idempotency_present] — whether idempotency key was sent
 * @property {boolean} [embedded_browser]
 * @property {number}  [retry_attempt]     — client attempt number
 */

/**
 * @typedef {Object} ShadowActual
 * @property {string}  [shadow_result_kind] — executeShadow outcome ('created','feature_off','error',…)
 * @property {number}  [status]             — HTTP status from signupIntentHttpCreate
 * @property {boolean} [idempotent_replay]  — true if shadow got a replay response
 * @property {boolean} [embedded_browser]
 * @property {number}  [retry_count]
 * @property {string}  [state]             — intent state ('pending','expired',…)
 * @property {string}  [source_platform]
 */

const DRIFT_CATEGORIES = Object.freeze([
  'missing_intent',
  'unexpected_state',
  'retry_mismatch',
  'embedded_browser_mismatch',
  'idempotency_mismatch',
  'lane_mismatch',
]);

/**
 * Detect mismatch categories between expected V1 result and actual shadow result.
 *
 * Pure function — no DB, no side effects, no mutations.
 *
 * @param {ShadowExpected} expected
 * @param {ShadowActual} actual
 * @returns {string[]} array of drift category strings
 */
function detectDrift(expected, actual) {
  const mismatches = [];
  try {
    if (!actual || actual.shadow_result_kind === 'error' || actual.shadow_result_kind === 'no_pool') {
      mismatches.push('missing_intent');
      return mismatches;
    }

    if (actual.shadow_result_kind === 'feature_off') {
      mismatches.push('missing_intent');
      return mismatches;
    }

    if (actual.state && actual.state !== 'pending') {
      mismatches.push('unexpected_state');
    }

    if (expected.retry_attempt != null && actual.retry_count != null) {
      if (expected.retry_attempt > 0 && actual.retry_count === 0) {
        mismatches.push('retry_mismatch');
      }
    }

    if (expected.embedded_browser != null && actual.embedded_browser != null) {
      if (Boolean(expected.embedded_browser) !== Boolean(actual.embedded_browser)) {
        mismatches.push('embedded_browser_mismatch');
      }
    }

    if (expected.idempotency_present != null && actual.idempotent_replay != null) {
      if (expected.idempotency_present && !actual.idempotent_replay) {
        mismatches.push('idempotency_mismatch');
      }
      if (!expected.idempotency_present && actual.idempotent_replay) {
        mismatches.push('idempotency_mismatch');
      }
    }

    const expectedLane = expected.lane || 'v1_default';
    const actualPlatform = actual.source_platform || 'shadow';
    if (expectedLane !== 'v1_default' && actualPlatform !== 'shadow' && expectedLane !== actualPlatform) {
      mismatches.push('lane_mismatch');
    }
  } catch (_) {
    mismatches.push('missing_intent');
  }
  return mismatches;
}

/**
 * Compute a deterministic confidence score from drift results and shadow outcome.
 *
 * Synchronous, dependency-free, pure function.
 *
 * @param {string[]} mismatches
 * @param {ShadowActual} actual
 * @returns {number} 0–100
 */
function computeConfidenceScore(mismatches, actual) {
  if (!actual || actual.shadow_result_kind === 'error' || actual.shadow_result_kind === 'no_pool') return 0;
  if (actual.shadow_result_kind === 'feature_off') return 0;

  if (!mismatches || mismatches.length === 0) return 100;

  if (mismatches.includes('missing_intent')) return 0;
  if (mismatches.includes('unexpected_state')) return 25;

  if (mismatches.length === 1 && mismatches[0] === 'idempotency_mismatch') return 50;
  if (mismatches.length === 1 && mismatches[0] === 'retry_mismatch') return 70;

  if (mismatches.every(m => ['embedded_browser_mismatch', 'lane_mismatch'].includes(m))) return 90;

  return Math.max(0, 100 - mismatches.length * 20);
}

let _comparisonSeq = 0;

/**
 * Compare a V1 registration result against a shadow V2 intent execution result.
 *
 * GUARANTEES:
 * - Pure comparison — no DB writes, no external calls, no mutations
 * - Synchronous and deterministic (given same inputs)
 * - Never throws — returns null on error
 *
 * @param {ShadowExpected} expected — V1 outcome metadata
 * @param {ShadowActual} actual — shadow intent result
 * @returns {{ comparison_id: string, comparison_version: string, drift_detected: boolean, mismatch_fields: string[], confidence_score: number, compared_at: string, shadow_result_kind: string } | null}
 */
export function compareShadowExecutionResult(expected, actual) {
  try {
    const mismatches = detectDrift(expected || {}, actual || {});
    const confidence = computeConfidenceScore(mismatches, actual || {});
    const comparisonId = `cmp-${Date.now()}-${++_comparisonSeq}`;

    const snapshot = {
      comparison_id: comparisonId,
      comparison_version: SHADOW_COMPARISON_VERSION,
      drift_detected: mismatches.length > 0,
      mismatch_fields: mismatches,
      confidence_score: confidence,
      compared_at: new Date().toISOString(),
      shadow_result_kind: actual?.shadow_result_kind || 'unknown',
    };

    emitShadowComparisonStdout(snapshot, expected);

    return snapshot;
  } catch (_) {
    return null;
  }
}

function emitShadowComparisonStdout(snapshot, expected) {
  try {
    if (!parseEnvBoolean(process.env.SIGNUP_SHADOW_COMPARISON_STDOUT, false)) return;
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      event: 'signup_shadow_comparison',
      schema: SHADOW_COMPARISON_VERSION,
      flow_version: SIGNUP_FLOW_VERSION,
      ...snapshot,
      expected_outcome: expected?.outcome || 'unknown',
      expected_lane: expected?.lane || 'v1_default',
    }));
  } catch (_) { /* noop */ }
}

// ─── Phase 3.4 — Snapshot persistence (append-only audit) ──────────

/**
 * Determine whether a comparison snapshot should be persisted.
 *
 * Persist if ANY of:
 * - drift_detected = true
 * - confidence_score < 100
 * - ENABLE_SIGNUP_SHADOW_FULL_AUDIT = true (persist everything, including score=100 no-drift)
 *
 * @param {{ drift_detected: boolean, confidence_score: number }} snapshot
 * @returns {boolean}
 */
export function shouldPersistShadowSnapshot(snapshot) {
  try {
    if (parseEnvBoolean(process.env.ENABLE_SIGNUP_SHADOW_FULL_AUDIT, false)) return true;
    if (!snapshot) return false;
    if (snapshot.drift_detected) return true;
    if (typeof snapshot.confidence_score === 'number' && snapshot.confidence_score < 100) return true;
    return false;
  } catch (_) {
    return false;
  }
}

/**
 * Fire-and-forget snapshot persistence into signup_shadow_snapshots.
 *
 * GUARANTEES:
 * - Async + isolated — NEVER awaited by V1
 * - Wrapped in try/catch — NEVER throws
 * - Skips when pool missing or snapshot doesn't meet persist criteria
 * - Append-only INSERT — no UPDATE, no DELETE, no FK dependency
 *
 * @param {import('pg').Pool | null} pool
 * @param {{ comparison_id: string, comparison_version: string, confidence_score: number, drift_detected: boolean, mismatch_fields: string[], shadow_result_kind: string }} snapshot
 * @param {{ request_id?: string, traffic_lane?: string }} [extra]
 */
export async function persistShadowComparisonSnapshot(pool, snapshot, extra) {
  try {
    if (!pool || !snapshot) return;
    if (!shouldPersistShadowSnapshot(snapshot)) return;

    await pool.query(
      `INSERT INTO signup_shadow_snapshots
        (comparison_id, comparison_version, confidence_score, drift_detected, mismatch_fields, shadow_result_kind, request_id, traffic_lane)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)`,
      [
        String(snapshot.comparison_id || '').slice(0, 80),
        String(snapshot.comparison_version || '').slice(0, 32),
        snapshot.confidence_score,
        snapshot.drift_detected,
        JSON.stringify(snapshot.mismatch_fields || []),
        String(snapshot.shadow_result_kind || 'unknown').slice(0, 32),
        extra?.request_id ? String(extra.request_id).slice(0, 120) : null,
        extra?.traffic_lane ? String(extra.traffic_lane).slice(0, 40) : null,
      ],
    );

    emitSnapshotStdout({
      snapshot_persisted: true,
      comparison_id: snapshot.comparison_id,
      confidence_score: snapshot.confidence_score,
      drift_detected: snapshot.drift_detected,
      mismatch_count: (snapshot.mismatch_fields || []).length,
      persist_reason: snapshot.drift_detected ? 'drift' : snapshot.confidence_score < 100 ? 'low_confidence' : 'full_audit',
    });
  } catch (e) {
    try {
      emitSnapshotStdout({
        snapshot_persisted: false,
        comparison_id: snapshot?.comparison_id,
        error: e?.message?.slice(0, 200),
      });
    } catch (_) { /* noop */ }
  }
}

function emitSnapshotStdout(payload) {
  try {
    if (!parseEnvBoolean(process.env.SIGNUP_SHADOW_SNAPSHOT_STDOUT, false)) return;
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      event: 'signup_shadow_snapshot',
      schema: 'shadow_snapshot_v1',
      flow_version: SIGNUP_FLOW_VERSION,
      ...payload,
    }));
  } catch (_) { /* noop */ }
}

/** Exported for external use / testing. */
export { DRIFT_CATEGORIES, SHADOW_COMPARISON_VERSION };

/**
 * Exposed for testing / manual invocation only.
 * @returns {boolean}
 */
export function isShadowExecutionActive() {
  return isShadowExecutionEnabled() && passesSampleRate();
}
