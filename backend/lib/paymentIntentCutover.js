/**
 * TASK 22 — Intent read cutover (controlled; default off).
 * Does not alter settlement FSM / webhook orchestration (separate PRs only).
 *
 * --- Cutover matrix (runtime reads vs writes) ---
 *
 * READS flipping to canonical-first (reuse Task 19D merge + fallback):
 * - `projectPaymentStateFromDb`: when PAYMENT_CANONICAL_READS=1 OR PAYMENT_INTENT_CUTOVER_READS=1,
 *   gateway-shaped evidence MAY be sourced from canonical `payments` (+ completeness/shadow guards)
 *   with deterministic fallback to `gateway_transactions`.
 * - `GET /api/payments/intents/:id`: same projection path + extended telemetry (`read_program`, phase).
 * - PAYMENT_CANONICAL_SHADOW audits: orthogonal; enables drift compares (recommended pre-cutover).
 *
 * WRITES (unchanged here — ledger / gateway_transactions remain authoring SoT).
 * settlement / reconcile / webhook apply paths MUST NOT toggle via this flag alone.
 *
 * --- Ops runbook ---
 * 1. Staging: PAYMENT_CANONICAL_SHADOW=1 — watch admin canonical audit for drift.
 * 2. Enable PAYMENT_CANONICAL_READS=1 — confirm controlled-read lane splits (canonical vs gateway fallback).
 * 3. PAYMENT_INTENT_CUTOVER_READS=1 + PAYMENT_INTENT_CUTOVER_PHASE=<shadow|phase_projection|phase_intent_api|full> — monitor intent_cutover_* metrics.
 * 4. Rollback: PAYMENT_INTENT_CUTOVER_READS=0 (and PAYMENT_CANONICAL_READS=0 if returning to gateway-only overlay).
 */

/** Canonical-first projection (Task 19D legacy toggle). */
export function isPaymentCanonicalReadsEnabled() {
  return String(process.env.PAYMENT_CANONICAL_READS || '').trim() === '1';
}

/** Task 22 final-reads cutover; implies same canonical-first path as 19D when bundle is healthy. */
export function isIntentCutoverReadsEnabled() {
  return String(process.env.PAYMENT_INTENT_CUTOVER_READS || '').trim() === '1';
}

/** Canonical-first overlay for projection: either legacy reads or intent cutover. */
export function isCanonicalFirstProjectionReadsEnabled() {
  return isPaymentCanonicalReadsEnabled() || isIntentCutoverReadsEnabled();
}

/**
 * @returns {'intent_cutover'|'canonical_reads'|'off'}
 */
export function getControlledReadProgram() {
  if (isIntentCutoverReadsEnabled()) return 'intent_cutover';
  if (isPaymentCanonicalReadsEnabled()) return 'canonical_reads';
  return 'off';
}

/** Phase tag for observability while intent cutover is ON — null otherwise. */
export function getIntentCutoverPhaseLabel() {
  if (!isIntentCutoverReadsEnabled()) return null;
  const p = String(process.env.PAYMENT_INTENT_CUTOVER_PHASE || 'unset').trim().toLowerCase();
  return p || 'unset';
}

/** Safe counter key segment for PAYMENT_INTENT_CUTOVER_PHASE. */
export function intentCutoverPhaseMetricSlug(label) {
  const s = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return s || 'unknown';
}
