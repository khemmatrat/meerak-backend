/**
 * Phase 2.5 — Background expiration sweeper for signup intents.
 *
 * Periodically transitions expired-pending intents and prunes old event logs.
 * Low-priority async worker; must NEVER block V1.
 * Gated by ENABLE_INTENT_SWEEPER (default off).
 */

import { getRegistrationEvolutionFeatureFlags, parseEnvBoolean } from './featureFlags.js';
import {
  SIGNUP_INTENT_STATES,
  SIGNUP_FLOW_VERSION,
  getIntentExpirationSweeperBatchSize,
  getIntentExpirationSweeperIntervalMs,
} from './signupIntentConstants.js';
import { emitIntentMetric } from './signupIntentMetrics.js';

let _sweepTimer = null;
let _sweepRunning = false;

/**
 * Run one sweep cycle: expire stale pending intents + optionally prune old events.
 * @param {import('pg').Pool} pool
 * @returns {Promise<{ expired: number, pruned: number }>}
 */
export async function runExpirationSweepOnce(pool) {
  const batchSize = getIntentExpirationSweeperBatchSize();
  let expired = 0;
  let pruned = 0;

  try {
    const result = await pool.query(
      `WITH batch AS (
        SELECT intent_id FROM signup_intents
        WHERE state = $1 AND expires_at <= NOW()
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
      UPDATE signup_intents si
      SET state = $3, updated_at = NOW()
      FROM batch
      WHERE si.intent_id = batch.intent_id
      RETURNING si.intent_id`,
      [SIGNUP_INTENT_STATES.PENDING, batchSize, SIGNUP_INTENT_STATES.EXPIRED],
    );

    expired = result.rowCount || 0;

    if (expired > 0) {
      const ids = result.rows.map((r) => r.intent_id);
      await pool.query(
        `INSERT INTO signup_intent_events (intent_id, from_state, to_state, meta)
         SELECT unnest($1::uuid[]), $2, $3, $4::jsonb`,
        [
          ids,
          SIGNUP_INTENT_STATES.PENDING,
          SIGNUP_INTENT_STATES.EXPIRED,
          JSON.stringify({ reason: 'sweeper_batch', flow_version: SIGNUP_FLOW_VERSION }),
        ],
      );
    }
  } catch (e) {
    console.warn('[signup-intent-sweeper] expire batch failed:', e?.message || e);
  }

  const pruneAgeDays = parseInt(process.env.SIGNUP_INTENT_EVENT_PRUNE_DAYS || '', 10);
  const shouldPrune = Number.isFinite(pruneAgeDays) && pruneAgeDays > 0;
  if (shouldPrune) {
    try {
      const pr = await pool.query(
        `DELETE FROM signup_intent_events
         WHERE created_at < NOW() - ($1 || ' days')::interval
         AND intent_id IN (
           SELECT intent_id FROM signup_intents WHERE state IN ($2, $3)
         )`,
        [pruneAgeDays, SIGNUP_INTENT_STATES.EXPIRED, SIGNUP_INTENT_STATES.CANCELLED],
      );
      pruned = pr.rowCount || 0;
    } catch (e) {
      console.warn('[signup-intent-sweeper] event prune failed:', e?.message || e);
    }
  }

  if (expired > 0 || pruned > 0) {
    const verbose = parseEnvBoolean(process.env.SIGNUP_INTENT_TRANSITION_STDOUT, false);
    if (verbose) {
      console.log(JSON.stringify({
        ts: new Date().toISOString(),
        event: 'signup_intent_sweeper',
        expired,
        pruned,
        flow_version: SIGNUP_FLOW_VERSION,
      }));
    }
  }

  emitIntentMetric('sweeper_cycle', { expired, pruned });
  return { expired, pruned };
}

/**
 * Start the periodic sweeper. Idempotent — calling multiple times is safe.
 * @param {import('pg').Pool} pool
 */
export function startIntentExpirationSweeper(pool) {
  if (_sweepTimer) return;
  if (!getRegistrationEvolutionFeatureFlags().ENABLE_INTENT_SWEEPER) return;

  const intervalMs = getIntentExpirationSweeperIntervalMs();

  _sweepTimer = setInterval(async () => {
    if (_sweepRunning) return;
    if (!getRegistrationEvolutionFeatureFlags().ENABLE_INTENT_SWEEPER) return;
    _sweepRunning = true;
    try {
      await runExpirationSweepOnce(pool);
    } catch (e) {
      console.warn('[signup-intent-sweeper] cycle error:', e?.message || e);
    } finally {
      _sweepRunning = false;
    }
  }, intervalMs);

  if (_sweepTimer.unref) _sweepTimer.unref();
  console.log(`[signup-intent-sweeper] started (interval=${intervalMs}ms, batch=${getIntentExpirationSweeperBatchSize()})`);
}

/**
 * Stop the sweeper (for graceful shutdown).
 */
export function stopIntentExpirationSweeper() {
  if (_sweepTimer) {
    clearInterval(_sweepTimer);
    _sweepTimer = null;
    _sweepRunning = false;
  }
}
