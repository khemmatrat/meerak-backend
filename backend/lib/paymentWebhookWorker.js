/**
 * Webhook worker module.
 *
 * Responsibilities:
 * - fetch + lock queued jobs (Task 4.1)
 * - idempotency probe + completion shortcut (Task 4.2)
 * - core processing of a single job inside a single transaction (Task 4.3)
 *
 * External integration is pluggable via setSignatureVerifier / setBusinessActionResolver
 * so this file remains the single source of truth for the worker contract.
 *
 * Idempotency layering (defense in depth, ordered weakest -> strongest):
 *   intake dedupe (payment_webhook_event_dedupe, Task 3)
 *     -> worker marker (processed_webhook_events, Task 4.2/4.3, atomic ON CONFLICT)
 *       -> state transition guard (UPDATE WHERE status IN PENDING/AUTHORIZED, Task 4.3)
 *         -> business handler DB constraints (handler responsibility, see contract below)
 *
 * Business handler idempotency contract (handlers MUST satisfy at the DB level):
 *   - ledger_entries.idempotency_key is UNIQUE NOT NULL (migration 007).
 *     Handlers SHOULD use deterministic keys scoped to canonical payment id
 *     (e.g. wallet_topup:${paymentId}) so a new provider event_id cannot apply twice.
 *   - ledger partial UNIQUE(payment_id) per event_type (migration 186) blocks
 *     cross-event double-apply even if keys were mis-generated.
 *   - wallets.balance vs ledger aggregates: reconcile via v_wallet_balance_reconciliation
 *     (`balance_variance_flag`, `suggested_action`, plus last_* triage columns — migrations 187/189).
 *   - payment_wallet_claims (188): UNIQUE(payment_id) for Payment Core wallet apply (separate
 *     from legacy hybrid `wallet_transactions` used for PaySo/manual funding).
 *   - outbound_domain_events: SKIP LOCKED claim → `sending` → sent | retry_scheduled | dead.
 *     Backoff same as webhook via `paymentRetryPolicy.js`; stuck `sending` requeued by
 *     `sweepOutboundStuckSending` (server_boot). webhook_event_id / ledger_entry_id on outbox rows
 *     chain intake → ledger → outbound; correlation in admin_actions_log.correlation_id.
 *
 * Orchestrator/handlers run entirely inside BEGIN/COMMIT: any handler failure MUST
 * ROLLBACK the whole transaction — no wedge state (gateway + ledger/outbox inconsistent).
 */

import { AsyncLocalStorage } from 'async_hooks';
import { normalizePaymentWebhookEvent } from './paymentEventNormalizer.js';
import {
  confirmPaymentWebhook,
  renormalizeEventFromJob,
  setSignatureVerifier as setCoreSignatureVerifier,
  setBusinessActionResolver as setCoreBusinessActionResolver,
} from './paymentCoreConfirm.js';
import {
  RETRY_SCHEDULE_SECONDS,
  RETRY_BACKOFF_SECONDS,
  RETRY_JITTER_RATIO,
  computeRetryDelaySeconds,
  classifyRetryability,
} from './paymentRetryPolicy.js';

export {
  RETRY_SCHEDULE_SECONDS,
  RETRY_BACKOFF_SECONDS,
  RETRY_JITTER_RATIO,
  classifyRetryability,
};

// =============================================================================
// Operational constants
// =============================================================================

/**
 * Stale 'processing' jobs older than this are reset to 'queued' by
 * requeueStaleProcessingWebhookJobs() (worker-crash safety net only).
 * Normal retryable failures use the explicit backoff schedule below.
 */
export const STALE_PROCESSING_TTL_MINUTES = 10;

/**
 * Retry backoff schedule (seconds) for retryable failures.
 * After RETRY_SCHEDULE_SECONDS.length retries are exhausted, the job is moved
 * to 'dead_letter' and flagged for manual review.
 *
 * Canonical schedule + retry taxonomy live in `./paymentRetryPolicy.js` (shared
 * with outbound_domain_events dispatcher). Bull queues stay `attempts:1`; DB owns retries.
 */

// =============================================================================
// Transaction scope (AsyncLocalStorage) + opt-in HTTP guard
// =============================================================================
//
// Set ENFORCE_NO_HTTP_IN_TX=1 to make globalThis.fetch throw when called
// inside processWebhookJob's transaction scope. This catches accidental
// external API calls that would otherwise hold a DB transaction open.
// Note: this only patches `fetch`; axios/http.request need their own guards
// if you use them.

const _txScope = new AsyncLocalStorage();

/** Returns true when called from inside processWebhookJob's tx body. */
export function isInsideWebhookTx() {
  return _txScope.getStore() === true;
}

if (process.env.ENFORCE_NO_HTTP_IN_TX === '1' && typeof globalThis.fetch === 'function') {
  const _origFetch = globalThis.fetch;
  globalThis.fetch = function (...args) {
    if (isInsideWebhookTx()) {
      const e = new Error('http_in_tx_forbidden: fetch is not allowed inside webhook transaction');
      e.code = 'HTTP_IN_TX_FORBIDDEN';
      e.nonRetryable = true;
      throw e;
    }
    return _origFetch.apply(this, args);
  };
}

function toBatchSize(input) {
  const n = Number(input);
  if (!Number.isFinite(n)) return 10;
  return Math.min(100, Math.max(1, Math.floor(n)));
}

function toNonEmptyString(v) {
  const s = String(v ?? '').trim();
  return s || null;
}

function normalizeEventKey(provider, eventId) {
  return {
    provider: toNonEmptyString(provider)?.toLowerCase() || null,
    eventId: toNonEmptyString(eventId),
  };
}

let _processedMarkerTableEnsured = false;
async function ensureProcessedMarkerTable(client) {
  if (_processedMarkerTableEnsured) return;
  await client.query(
    `CREATE TABLE IF NOT EXISTS processed_webhook_events (
       provider TEXT NOT NULL,
       event_id TEXT NOT NULL,
       processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       trace_id TEXT,
       PRIMARY KEY (provider, event_id)
     )`,
  );
  _processedMarkerTableEnsured = true;
}

/**
 * Fetch and lock queued webhook jobs for processing.
 * Safe for multiple workers via FOR UPDATE SKIP LOCKED.
 *
 * @param {import('pg').Pool} pool
 * @param {{ batchSize?: number }} [opts]
 */
export async function fetchAndLockQueuedWebhookJobs(pool, opts = {}) {
  const batchSize = toBatchSize(opts.batchSize ?? 10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `WITH picked AS (
         SELECT id
         FROM payment_webhook_jobs
         WHERE status = 'queued'
           AND next_attempt_at <= NOW()
       ORDER BY next_attempt_at ASC, id ASC
         FOR UPDATE SKIP LOCKED
         LIMIT $1
       )
       UPDATE payment_webhook_jobs j
       SET status = 'processing',
           attempt_count = j.attempt_count + 1,
           updated_at = NOW()
       FROM picked
       WHERE j.id = picked.id
       RETURNING
         j.id,
         j.provider,
         j.event_id,
         j.event_type,
         j.trace_id,
         j.headers_json,
         j.payload_json,
         j.payload_sha256,
         j.idempotency_key,
         j.status,
         j.retryable,
         j.attempt_count,
         j.next_attempt_at,
         j.last_error,
         j.processed_at,
         j.dead_lettered_at,
         j.created_at,
         j.updated_at`,
      [batchSize],
    );
    await client.query('COMMIT');
    return r.rows || [];
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Requeue jobs stuck in processing state (worker crash safety).
 * Keeps logic isolated from processing/business execution.
 *
 * @param {import('pg').Pool} pool
 * @param {{ staleAfterMinutes?: number }} [opts]
 */
export async function requeueStaleProcessingWebhookJobs(pool, opts = {}) {
  const staleAfterMinutes = Math.min(
    120,
    Math.max(1, Math.floor(Number(opts.staleAfterMinutes ?? STALE_PROCESSING_TTL_MINUTES) || STALE_PROCESSING_TTL_MINUTES)),
  );
  const r = await pool.query(
    `UPDATE payment_webhook_jobs
     SET status = 'queued',
         next_attempt_at = NOW(),
         updated_at = NOW(),
         last_error = COALESCE(last_error, 'stale_processing_requeued')
     WHERE status = 'processing'
       AND updated_at < NOW() - ($1::int * INTERVAL '1 minute')
     RETURNING id`,
    [staleAfterMinutes],
  );
  return Number(r.rowCount || 0);
}

/**
 * Fast idempotency probe:
 * checks whether this provider:event_id was already processed successfully.
 *
 * Source of truth for this probe:
 * - payment_transaction_logs (webhook_event_id in metadata)
 * - payment_ledger_audit metadata webhook_event_id (if present by other flows)
 *
 * @param {import('pg').Pool} pool
 * @param {{ provider: string, event_id: string }} input
 */
export async function isWebhookEventAlreadyProcessed(pool, input) {
  const { provider, eventId } = normalizeEventKey(input?.provider, input?.event_id);
  if (!provider || !eventId) {
    return { alreadyProcessed: false, reason: 'missing_provider_or_event_id' };
  }

  const marker = await pool.query(
    `SELECT provider, event_id, processed_at, trace_id
     FROM processed_webhook_events
     WHERE provider = $1 AND event_id = $2
     LIMIT 1`,
    [provider, eventId],
  ).catch(() => ({ rows: [] }));
  if (marker.rows?.length) {
    return { alreadyProcessed: true, reason: 'processed_webhook_events', refId: `${provider}:${eventId}` };
  }

  const tx = await pool.query(
    `SELECT id
     FROM payment_transaction_logs
     WHERE gateway = $1
       AND COALESCE(metadata->>'webhook_event_id','') = $2
       AND COALESCE(status,'') IN ('paid','completed','success','successful','succeeded')
     LIMIT 1`,
    [provider, eventId],
  );
  if (tx.rows?.length) {
    return { alreadyProcessed: true, reason: 'payment_transaction_logs', refId: tx.rows[0].id };
  }

  const ledger = await pool.query(
    `SELECT id
     FROM payment_ledger_audit
     WHERE COALESCE(LOWER(gateway),'') = $1
       AND COALESCE(metadata->>'webhook_event_id','') = $2
     LIMIT 1`,
    [provider, eventId],
  );
  if (ledger.rows?.length) {
    return { alreadyProcessed: true, reason: 'payment_ledger_audit', refId: ledger.rows[0].id };
  }

  return { alreadyProcessed: false, reason: 'not_found' };
}

/**
 * If already processed, mark worker job completed and skip further processing.
 * Safe under concurrency by locking the target job row in transaction.
 *
 * @param {import('pg').Pool} pool
 * @param {{ id: string, provider: string, event_id: string }} job
 */
export async function completeWebhookJobIfAlreadyProcessed(pool, job) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureProcessedMarkerTable(client);
    const lock = await client.query(
      `SELECT id, status
       FROM payment_webhook_jobs
       WHERE id = $1::uuid
       FOR UPDATE`,
      [job.id],
    );
    if (!lock.rows?.length) {
      await client.query('COMMIT');
      return { skipped: true, alreadyProcessed: true, reason: 'job_missing' };
    }

    const { provider, eventId } = normalizeEventKey(job?.provider, job?.event_id);
    if (!provider || !eventId) {
      await client.query('COMMIT');
      return { skipped: false, alreadyProcessed: false, reason: 'missing_provider_or_event_id' };
    }

    const cur = lock.rows[0];
    if (['processed', 'completed'].includes(String(cur.status || ''))) {
      await client.query('COMMIT');
      return { skipped: true, alreadyProcessed: true, reason: 'already_completed' };
    }

    const marker = await client.query(
      `SELECT 1
       FROM processed_webhook_events
       WHERE provider = $1 AND event_id = $2
       LIMIT 1`,
      [provider, eventId],
    );
    let probe = null;
    if (marker.rows?.length) {
      probe = { alreadyProcessed: true, reason: 'processed_webhook_events', refId: `${provider}:${eventId}` };
    } else {
      const tx = await client.query(
        `SELECT id
         FROM payment_transaction_logs
         WHERE gateway = $1
           AND COALESCE(metadata->>'webhook_event_id','') = $2
           AND COALESCE(status,'') IN ('paid','completed','success','successful','succeeded')
         LIMIT 1`,
        [provider, eventId],
      );
      if (tx.rows?.length) {
        probe = { alreadyProcessed: true, reason: 'payment_transaction_logs', refId: tx.rows[0].id };
      } else {
        const ledger = await client.query(
          `SELECT id
           FROM payment_ledger_audit
           WHERE COALESCE(LOWER(gateway),'') = $1
             AND COALESCE(metadata->>'webhook_event_id','') = $2
           LIMIT 1`,
          [provider, eventId],
        );
        if (ledger.rows?.length) {
          probe = { alreadyProcessed: true, reason: 'payment_ledger_audit', refId: ledger.rows[0].id };
        }
      }
    }

    if (!probe?.alreadyProcessed) {
      await client.query('COMMIT');
      return { skipped: false, alreadyProcessed: false, reason: 'not_found' };
    }

    await client.query(
      `INSERT INTO processed_webhook_events (provider, event_id, trace_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (provider, event_id) DO NOTHING`,
      [provider, eventId, toNonEmptyString(job?.trace_id)],
    );

    await client.query(
      `UPDATE payment_webhook_jobs
       SET status = 'processed',
           processed_at = NOW(),
           updated_at = NOW(),
           last_error = NULL
       WHERE id = $1::uuid`,
      [job.id],
    );
    await client.query('COMMIT');
    return { skipped: true, alreadyProcessed: true, reason: probe.reason, refId: probe.refId };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Atomic idempotency claim helper for use inside processing transaction (Task 4.3).
 * - insert succeeds => first processor
 * - conflict => already processed/claimed by another worker
 *
 * IMPORTANT: call this with normalized keys and within the same transaction
 * as processing + state mutation, so rollback releases the marker.
 *
 * @param {import('pg').PoolClient} client
 * @param {{ provider: string, event_id: string, trace_id?: string | null }} input
 */
export async function claimWebhookProcessingMarkerTx(client, input) {
  await ensureProcessedMarkerTable(client);
  const { provider, eventId } = normalizeEventKey(input?.provider, input?.event_id);
  if (!provider || !eventId) {
    return { claimed: false, reason: 'missing_provider_or_event_id' };
  }
  const r = await client.query(
    `INSERT INTO processed_webhook_events (provider, event_id, trace_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (provider, event_id) DO NOTHING
     RETURNING 1`,
    [provider, eventId, toNonEmptyString(input?.trace_id)],
  );
  return {
    claimed: r.rowCount > 0,
    reason: r.rowCount > 0 ? 'first_process' : 'already_processed',
    provider,
    event_id: eventId,
  };
}

// =============================================================================
// Task 4.3: processWebhookJob (single-job core processing)
// =============================================================================
//
// Pluggable hooks (registered by other modules at boot, not from this file).
// Defaults are intentionally permissive so the worker can run before security
// and business modules are wired in. Production deployments MUST register a
// strict signature verifier and a business action resolver.
// -----------------------------------------------------------------------------

/**
 * @typedef {object} SignatureVerifyResult
 * @property {boolean} ok
 * @property {string} [key_version]
 * @property {string} [failure_code]
 *
 * @callback SignatureVerifierFn
 * @param {{ job: any, normalized: any }} input
 * @returns {Promise<SignatureVerifyResult> | SignatureVerifyResult}
 *
 * @typedef {object} BusinessActionHandler
 * @property {(payment: any, event: any) => Promise<{ ok: boolean, failure_code?: string }> | { ok: boolean, failure_code?: string }} validate
 * @property {(client: import('pg').PoolClient, payment: any, event: any) => Promise<any>} execute
 *
 * @callback BusinessActionResolverFn
 * @param {{ purpose: string|null, normalized: any, payment: any|null }} input
 * @returns {BusinessActionHandler | null | Promise<BusinessActionHandler | null>}
 */

/** @param {SignatureVerifierFn|null} fn */
export function setSignatureVerifier(fn) {
  setCoreSignatureVerifier(fn);
}

/** @param {BusinessActionResolverFn|null} fn */
export function setBusinessActionResolver(fn) {
  setCoreBusinessActionResolver(fn);
}

function _payloadFromJob(job) {
  const p = job?.payload_json;
  if (p && typeof p === 'object') {
    if (typeof p.raw_body === 'string' && p.raw_body.length) {
      try {
        return JSON.parse(p.raw_body);
      } catch {
        // fall through to structured payload
      }
    }
    return p;
  }
  return {};
}

function _headersFromJob(job) {
  const h = job?.headers_json;
  if (h && typeof h === 'object' && !Array.isArray(h)) return h;
  const p = job?.payload_json;
  if (p && typeof p === 'object' && p.headers && typeof p.headers === 'object') return p.headers;
  return {};
}

/**
 * Audit-friendly fields gathered from the job (and optionally the normalized
 * event) so every failure log can be replayed/debugged without joining tables.
 */
function _buildAuditFields(job, normalized, extra = {}) {
  return {
    job_id: job?.id || null,
    provider: job?.provider || null,
    event_id: job?.event_id || null,
    event_type: job?.event_type || null,
    trace_id: job?.trace_id || normalized?.trace_id || null,
    raw_hash: job?.payload_sha256 || normalized?.raw_hash || null,
    attempt_count: job?.attempt_count != null ? Number(job.attempt_count) : null,
    ...extra,
  };
}

// =============================================================================
// Task 4.4: Job finalization handlers (post-tx, single-responsibility)
// =============================================================================
//
// Critical rules (per Task 4.4 spec):
// - Business transaction is committed BEFORE finalize* runs.
// - Job state mutations use the pool (NOT the in-tx client) so they never
//   block business logic and never share a tx with handler.execute().
// - All UPDATEs are idempotent: WHERE clauses guard against state regression
//   (e.g. status NOT IN ('processed', 'dead_letter')).
// - DB update failures are logged but never thrown to the worker loop; the
//   stale-requeuer (TTL = STALE_PROCESSING_TTL_MINUTES) acts as a safety net.

/**
 * Compute backoff seconds for the *current* attempt that just failed.
 * The fetcher already incremented attempt_count, so attempt_count=1 means
 * the first processing run failed and we're about to schedule retry #2.
 *
 * Returns null when retries are exhausted (caller should call
 * finalizeDeadLetter instead).
 */
function _computeBackoffSeconds(attemptCount) {
  return computeRetryDelaySeconds(attemptCount);
}

function _logSafe(level, message, data) {
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  try {
    fn(`[paymentWebhookWorker] ${message}`, data);
  } catch {
    /* never let logging crash the worker */
  }
}

// All finalize* UPDATEs use this terminal-state guard to prevent double
// finalization races (e.g. another worker already moved the job to a terminal
// state, or the stale-requeuer reset 'processing' between the tx commit and
// the post-tx UPDATE).
const _TERMINAL_STATES = ['processed', 'dead_letter', 'hard_failed'];

/**
 * Mark the job processed after a successful business commit.
 * Idempotent: if the job is already in a terminal state, the UPDATE is a no-op.
 */
export async function finalizeSuccess(pool, job) {
  try {
    await pool.query(
      `UPDATE payment_webhook_jobs
       SET status = 'processed',
           processed_at = NOW(),
           updated_at = NOW(),
           last_error = NULL
       WHERE id = $1::uuid
         AND status NOT IN ('processed', 'dead_letter', 'hard_failed')`,
      [job.id],
    );
    _logSafe('log', 'success', _buildAuditFields(job, null, {
      result_type: 'success',
    }));
  } catch (e) {
    _logSafe('error', 'finalizeSuccess update failed',
      _buildAuditFields(job, null, {
        result_type: 'success',
        error: e?.message || String(e),
      }));
  }
}

/**
 * Schedule a retry after a retryable failure.
 *
 * Guards (in order):
 *   1. job.retryable === false  -> hard_fail (never retry a job marked
 *                                  non-retryable; safety net against caller
 *                                  bugs that bypass classification).
 *   2. attempt_count exhausted  -> dead_letter (delegated).
 *   3. otherwise                -> queue with backoff + jitter.
 *
 * NOTE on clock skew: next_attempt_at is computed entirely on the DB side
 * via NOW() + INTERVAL. The app only sends the integer seconds delta. This
 * guarantees consistent retry timing across worker hosts even when their
 * system clocks drift.
 *
 * Optional `opts.failure_code`: overrides `error.code` for audit/logs (classification).
 *
 * Returns { dlq: boolean, seconds: number|null, blocked?: boolean }.
 */
export async function finalizeRetry(pool, job, error, opts = {}) {
  // Guard 1: respect explicit non-retryable flag on the job row.
  if (job?.retryable === false) {
    await finalizeHardFail(pool, job, 'retry_blocked_by_flag', {
      reason: 'retry_blocked_by_flag',
      source: 'retry_guard',
      error: String(error?.message || error || ''),
    });
    return { dlq: false, seconds: null, blocked: true };
  }

  // Guard 2: retries exhausted -> dead-letter via the canonical handler.
  const seconds = _computeBackoffSeconds(job?.attempt_count);
  if (seconds == null) {
    return finalizeDeadLetter(pool, job, error, { reason: 'max_retries_exceeded' });
  }

  const errMsg = String(error?.message || error || 'retryable_error').slice(0, 500);
  const failureCode = String(
    opts.failure_code ?? error?.code ?? 'retryable_error',
  ).slice(0, 100);
  try {
    await pool.query(
      `UPDATE payment_webhook_jobs
       SET status = 'queued',
           next_attempt_at = NOW() + ($3::int * INTERVAL '1 second'),
           updated_at = NOW(),
           last_error = $2
       WHERE id = $1::uuid
         AND status = 'processing'`,
      [job.id, errMsg, seconds],
    );
  } catch (e) {
    _logSafe('error', 'finalizeRetry update failed',
      _buildAuditFields(job, null, {
        result_type: 'retry_scheduled',
        error: e?.message || String(e),
      }));
  }
  _logSafe('warn', 'retry_scheduled', _buildAuditFields(job, null, {
    result_type: 'retry_scheduled',
    failure_code: failureCode,
    failure_reason: errMsg,
    backoff_seconds: seconds,
    next_attempt_count: (Number(job?.attempt_count) || 0) + 1,
    requires_manual_review: false,
  }));
  return { dlq: false, seconds };
}

/**
 * Move the job to the dead-letter terminal state after retries are exhausted
 * (or when the caller explicitly determines further retry is pointless).
 *
 * Persists a categorical `dead_letter_reason` (column added by migration 185)
 * for analytics / dashboards. Falls back gracefully if migration hasn't run:
 * a 42703 (undefined_column) error is caught and re-issued without the column.
 *
 * Notes:
 * - payment_webhook_jobs has no `requires_manual_review` column; the
 *   `dead_letter` status itself is the on-row indicator. Operations should
 *   query WHERE status='dead_letter' to surface jobs needing manual review.
 * - The structured log carries `requires_manual_review:true` for alerting.
 *
 * @param {{ reason?: string }} [opts] reason category, default 'max_retries_exceeded'
 */
export async function finalizeDeadLetter(pool, job, error, opts = {}) {
  const errMsg = String(error?.message || error || 'max_retries_exceeded').slice(0, 500);
  const reasonCategory = String(opts.reason || 'max_retries_exceeded').slice(0, 100);
  try {
    await pool.query(
      `UPDATE payment_webhook_jobs
       SET status = 'dead_letter',
           dead_lettered_at = NOW(),
           updated_at = NOW(),
           last_error = $2,
           dead_letter_reason = $3
       WHERE id = $1::uuid
         AND status NOT IN ('processed', 'dead_letter', 'hard_failed')`,
      [job.id, errMsg, reasonCategory],
    );
  } catch (e) {
    if (String(e?.code || '') === '42703') {
      // Column not yet present (migration 185 not applied). Fall back so the
      // job still terminates cleanly; `last_error` retains the message.
      try {
        await pool.query(
          `UPDATE payment_webhook_jobs
           SET status = 'dead_letter',
               dead_lettered_at = NOW(),
               updated_at = NOW(),
               last_error = $2
           WHERE id = $1::uuid
             AND status NOT IN ('processed', 'dead_letter', 'hard_failed')`,
          [job.id, errMsg],
        );
      } catch (e2) {
        _logSafe('error', 'finalizeDeadLetter fallback update failed',
          _buildAuditFields(job, null, {
            result_type: 'dead_letter',
            error: e2?.message || String(e2),
          }));
      }
    } else {
      _logSafe('error', 'finalizeDeadLetter update failed',
        _buildAuditFields(job, null, {
          result_type: 'dead_letter',
          error: e?.message || String(e),
        }));
    }
  }
  _logSafe('error', 'dead_letter', _buildAuditFields(job, null, {
    result_type: 'dead_letter',
    failure_code:
      reasonCategory === 'max_retries_exceeded' ? 'RETRY_EXHAUSTED' : reasonCategory,
    failure_reason: errMsg,
    dead_letter_reason: reasonCategory,
    retry_attempts_used: Number(job?.attempt_count) || null,
    requires_manual_review: true,
  }));
  return { dlq: true, seconds: null };
}

/**
 * Mark the job hard-failed for non-retryable errors (invalid signature,
 * invalid payload, invalid transition, business validation reject, runtime
 * non-retryable Postgres errors, retry-blocked-by-flag).
 *
 * @param {{ reason?: string, source?: string, transition_reason?: string, normalized?: any, error?: string }} [audit]
 */
export async function finalizeHardFail(pool, job, failureCode, audit = {}) {
  const reasonStr = String(failureCode || 'hard_failed').slice(0, 500);
  try {
    await pool.query(
      `UPDATE payment_webhook_jobs
       SET status = 'hard_failed',
           retryable = FALSE,
           last_error = $2,
           updated_at = NOW()
       WHERE id = $1::uuid
         AND status NOT IN ('processed', 'dead_letter', 'hard_failed')`,
      [job.id, reasonStr],
    );
  } catch (e) {
    _logSafe('error', 'finalizeHardFail update failed',
      _buildAuditFields(job, null, {
        result_type: 'hard_failed',
        error: e?.message || String(e),
      }));
  }
  _logSafe('error', 'hard_failed', _buildAuditFields(job, audit?.normalized || null, {
    result_type: 'hard_failed',
    failure_code: reasonStr,
    failure_reason: audit?.reason || reasonStr,
    transition_reason: audit?.transition_reason || null,
    error: audit?.error || null,
    source: audit?.source || 'explicit',
    requires_manual_review: true,
  }));
}

/**
 * Process a single locked webhook job inside one DB transaction.
 *
 * Caller contract:
 * - The job MUST have already been locked via fetchAndLockQueuedWebhookJobs
 *   (status='processing', attempt_count incremented).
 * - This function performs no external API calls inside the transaction.
 *   When ENFORCE_NO_HTTP_IN_TX=1, accidental fetch() inside the tx scope
 *   will throw HTTP_IN_TX_FORBIDDEN (treated as non-retryable).
 * - On retryable error (DB deadlock, network, crash classes): rolls back,
 *   schedules retry with fixed DB-side backoff, or moves to 'dead_letter'
 *   after RETRY_SCHEDULE_SECONDS.length attempts. Marker (if claimed) is
 *   released by the rollback so the next attempt can re-claim cleanly.
 * - On non-retryable error: rolls back business changes, marks job
 *   'hard_failed' with structured audit log (failure_code, trace_id,
 *   event_id, raw_hash, attempt_count, provider).
 * - On success: commits, marks job 'processed' after commit.
 *
 * Important behavior notes:
 * - State transition rowCount=0 (lost race / already paid) is NOT an error.
 *   The handler MUST still run because money may already be in the system
 *   while business effects (wallet credit, job assignment) have not yet
 *   happened. Idempotent handlers must detect duplicates via DB unique
 *   constraints (ledger_entries.idempotency_key, domain UNIQUE).
 *
 * @param {import('pg').Pool} pool
 * @param {any} job locked row returned by fetchAndLockQueuedWebhookJobs
 */
export async function processWebhookJob(pool, job) {
  const refs = {
    jobId: toNonEmptyString(job?.id),
    provider: null,
    eventId: null,
    traceId: toNonEmptyString(job?.trace_id),
  };

  // Step 1: normalize identity (deterministic, before opening tx).
  const { provider, eventId } = normalizeEventKey(job?.provider, job?.event_id);
  refs.provider = provider;
  refs.eventId = eventId;
  if (!provider || !eventId) {
    await _markJobHardFailed(pool, job, 'missing_provider_or_event_id', {
      reason: 'missing_provider_or_event_id',
      source: 'identity',
    });
    return { status: 'failed', reason: 'missing_provider_or_event_id', retryable: false, refs };
  }

  const client = await pool.connect();
  // result of the in-tx phase. Exactly one of these gets set.
  let success = null;       // { status: 'processed'|'skipped', ... }
  let explicitFail = null;  // { reason, transition?, error? } -> hard_fail outside tx
  let runtimeError = null;  // unhandled throw -> classify outside tx

  try {
    await _txScope.run(true, async () => {
      let txEnded = false;
      try {
        await client.query('BEGIN');

        // Step 2: idempotency marker (CRITICAL, atomic).
        await ensureProcessedMarkerTable(client);
        const claim = await client.query(
          `INSERT INTO processed_webhook_events (provider, event_id, trace_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (provider, event_id) DO NOTHING
           RETURNING 1`,
          [provider, eventId, refs.traceId],
        );
        if (claim.rowCount === 0) {
          // Already processed by another path. Mark this job processed in the
          // same tx so that audit reflects the skip atomically.
          await client.query(
            `UPDATE payment_webhook_jobs
             SET status = 'processed',
                 processed_at = NOW(),
                 updated_at = NOW(),
                 last_error = NULL
             WHERE id = $1::uuid
               AND status NOT IN ('processed', 'dead_letter', 'hard_failed')`,
            [job.id],
          );
          await client.query('COMMIT');
          txEnded = true;
          _logSafe('log', 'skipped', _buildAuditFields(job, null, {
            result_type: 'skipped',
            reason: 'already_processed',
          }));
          success = { status: 'skipped', reason: 'already_processed', retryable: false, refs };
          return;
        }

        // Step 4 (re-normalize, deterministic) — done early so it can feed verifier.
        const normalized = renormalizeEventFromJob(job, provider, toNonEmptyString(job?.payload_sha256));

        // Steps 3-8: delegate to PaymentCoreConfirm orchestrator (Task 7).
        // Orchestrator handles: signature → validate → transition → business action.
        const result = await confirmPaymentWebhook(client, {
          normalized,
          job,
          provider,
          eventId,
          traceId: refs.traceId,
        });

        if (!result.ok) {
          // Orchestrator returned explicit failure (signature, validation, transition,
          // or business validation). Rollback and let post-tx phase handle finalization.
          await client.query('ROLLBACK');
          txEnded = true;
          explicitFail = {
            reason: result.failure_code || 'confirm_failed',
            normalized,
            source: result.failure_source || 'orchestrator',
            transition: result.transition || null,
            error: result.error || null,
          };
          return;
        }

        // Step 9: commit.
        await client.query('COMMIT');
        txEnded = true;

        success = {
          status: 'processed',
          reason: result.transition?.applied ? 'state_transitioned' : result.transition?.reason || 'no_transition',
          retryable: false,
          refs,
          transition: result.transition,
          handler: result.handler,
        };
      } catch (e) {
        if (!txEnded) {
          await client.query('ROLLBACK').catch(() => {});
        }
        runtimeError = e;
      }
    });
  } finally {
    client.release();
  }

  // -------------------- Post-tx phase (Task 4.4 finalization) --------------------
  //
  // Dispatch to one of the four finalize* handlers based on what happened
  // inside the tx scope. Each handler is idempotent and never throws into
  // the worker loop.

  if (runtimeError) {
    const syn = classifyRetryability(runtimeError);

    if (syn.retryable === true && syn.hardFail !== true) {
      const r = await finalizeRetry(pool, job, runtimeError, {
        failure_code: syn.failureCode,
      });
      return {
        status: 'failed',
        reason: r.dlq ? 'dead_letter' : 'retryable_error',
        retryable: !r.dlq,
        refs,
        error: String(runtimeError?.message || runtimeError),
        retry: { dlq: r.dlq, seconds: r.seconds },
        failure_code: syn.failureCode || null,
      };
    }

    const fcHard = syn.failureCode || 'NETWORK_ERROR';
    await finalizeHardFail(pool, job, fcHard, {
      reason: fcHard,
      source: 'runtime_classified_hard_fail',
      error: String(runtimeError?.message || runtimeError),
    });
    return {
      status: 'failed',
      reason: fcHard,
      retryable: false,
      refs,
      error: String(runtimeError?.message || runtimeError),
      failure_code: fcHard,
    };
  }

  if (explicitFail) {
    await finalizeHardFail(pool, job, explicitFail.reason, {
      reason: explicitFail.reason,
      source: explicitFail.source,
      transition_reason: explicitFail.transition?.reason || null,
      normalized: explicitFail.normalized || null,
      error: explicitFail.error || null,
    });
    return {
      status: 'failed',
      reason: explicitFail.reason,
      retryable: false,
      refs,
      transition: explicitFail.transition || null,
    };
  }

  if (success && success.status === 'processed') {
    // Marker insert inside the tx already guarantees no double processing
    // even if this status update is delayed or fails to apply.
    await finalizeSuccess(pool, job);
  }
  return success;
}
