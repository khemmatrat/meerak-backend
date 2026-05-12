/**

 * Outbound domain event dispatch (PostgreSQL SKIP LOCKED claim pattern).

 *

 * Lifecycle: pending | retry_scheduled → sending → sent | retry_scheduled | dead.

 * Uses the same backoff schedule as webhook jobs via `paymentRetryPolicy.js`.

 *

 * Contract (caller HTTP layer):

 *   - Only call `finalizeOutboundSent` after downstream HTTP success (2xx).

 *   - On failure/timeout/non-2xx use `finalizeOutboundFailedDispatch`; never mark sent first.

 *

 * Stuck `sending` (worker crash / network hang / deploy): `sweepOutboundStuckSending`

 * or `startOutboundStuckSendingSweeper` (runs every few minutes from server boot).

 */



import { computeRetryBackoffSeconds } from './paymentRetryPolicy.js';



const MAX_BATCH = 500;



function clampBatch(n) {

  const x = Math.floor(Number(n) || 20);

  return Math.min(MAX_BATCH, Math.max(1, x));

}



function clampStaleMinutes(n) {

  const x = Math.floor(Number(n) || 5);

  return Math.min(120, Math.max(1, x));

}



/**

 * Requeue rows stuck in `sending` (crash mid-flight, hung client, deploy).

 * Bumps attempt_count once per reclaim (operational visibility).

 *

 * @param {import('pg').PoolClient | import('pg').Pool} db

 * @param {{ staleMinutes?: number }} [opts] default 5 (or OUTBOUND_SENDING_STALE_MINUTES)

 * @returns {Promise<bigint[]>} requeued row ids

 */

export async function sweepOutboundStuckSending(db, opts = {}) {

  const envM = process.env.OUTBOUND_SENDING_STALE_MINUTES;

  const staleMinutes = clampStaleMinutes(opts.staleMinutes ?? (envM != null ? envM : 5));

  const r = await db.query(

    `UPDATE outbound_domain_events

     SET status = 'pending',

         attempt_count = attempt_count + 1,

         next_attempt_at = NOW(),

         updated_at = NOW()

     WHERE status = 'sending'

       AND updated_at < NOW() - ($1::int * INTERVAL '1 minute')

     RETURNING id`,

    [staleMinutes],

  );

  return (r.rows || []).map((row) => row.id);

}



/**

 * Start periodic sweeper on `pool`. Returns dispose `() => void`.

 *

 * Disabled when OUTBOUND_SENDING_SWEEP_ENABLED=0.

 * Interval OUTBOUND_SENDING_SWEEP_MS (default 180000).

 *

 * @param {import('pg').Pool} pool

 */

export function startOutboundStuckSendingSweeper(pool, opts = {}) {

  if (process.env.OUTBOUND_SENDING_SWEEP_ENABLED === '0') {

    return () => {};

  }

  const intervalMsRaw = opts.intervalMs ?? process.env.OUTBOUND_SENDING_SWEEP_MS ?? 180000;

  const intervalMs = Math.max(60_000, Math.floor(Number(intervalMsRaw)) || 180_000);



  const run = () => {

    sweepOutboundStuckSending(pool, { staleMinutes: opts.staleMinutes })

      .then((ids) => {

        if (ids.length) {

          console.log('[outboundDomainDispatch] sending_sweeper_requeued', {

            result_type: 'outbound_stuck_sending_requeued',

            count: ids.length,

            outbound_event_ids_sample: ids.slice(0, 20),

          });

        }

      })

      .catch((e) => {

        console.error('[outboundDomainDispatch] sending_sweeper_error', {

          result_type: 'outbound_stuck_sweeper_error',

          error: e?.message || String(e),

        });

      });

  };



  run();

  const t = setInterval(run, intervalMs);

  return () => clearInterval(t);

}



/**

 * Claim pending/retry-scheduled rows due for dispatch; moves them atomically to `sending`.

 *

 * @param {import('pg').PoolClient | import('pg').Pool} db

 * @param {number} [limit]

 * @returns {Promise<any[]>} claimed rows (`status === 'sending'`)

 */

export async function claimOutboundEventsForSending(db, limit = 20) {

  const r = await db.query(

    `WITH cte AS (

       SELECT id

       FROM outbound_domain_events

       WHERE (status IN ('pending', 'retry_scheduled'))

         AND next_attempt_at <= NOW()

       ORDER BY next_attempt_at ASC, id ASC

       FOR UPDATE SKIP LOCKED

       LIMIT $1

     )

     UPDATE outbound_domain_events o

     SET status = 'sending',

         updated_at = NOW()

     FROM cte

     WHERE o.id = cte.id

     RETURNING o.*`,

    [clampBatch(limit)],

  );

  return r.rows || [];

}



/**

 * Mark outbound row successfully delivered. Call only after verified HTTP success (e.g. 2xx).

 */

export async function finalizeOutboundSent(db, id) {

  const r = await db.query(

    `UPDATE outbound_domain_events

     SET status = 'sent',

         updated_at = NOW()

     WHERE id = $1::bigint

       AND status = 'sending'

     RETURNING id`,

    [Number(id)],

  );

  return (r.rows || []).length > 0;

}



/**

 * Structured log fields for dispatch outcomes (dashboards / alerts).

 *

 * @param {any} row claimed row (outbound_domain_events)

 * @param {{ result_type: string, latency_ms?: number|null, destination?: string|null, error?: string|null }} extra

 */

export function outboundDispatchLogFields(row, extra) {

  const rt = String(extra?.result_type || 'outbound_dispatch');

  return {

    result_type: rt,

    latency_ms: extra?.latency_ms != null ? Number(extra.latency_ms) : null,

    destination: extra?.destination != null ? String(extra.destination) : null,

    attempt_count: row?.attempt_count != null ? Number(row.attempt_count) : null,

    outbound_event_id: row?.id != null ? String(row.id) : null,

    event_name: row?.event_name != null ? String(row.event_name) : null,

    payment_id: row?.payment_id != null ? String(row.payment_id) : null,

    trace_id: row?.trace_id != null ? String(row.trace_id) : null,

    webhook_event_id: row?.webhook_event_id != null ? String(row.webhook_event_id) : null,

    ledger_entry_id: row?.ledger_entry_id != null ? String(row.ledger_entry_id) : null,

    ...(extra?.error != null && extra.error !== ''

      ? { error: String(extra.error).slice(0, 500) }

      : {}),

  };

}



/**

 * After a failed dispatch for a row claimed as `sending`.

 * Mirrors webhook retry numbering: increments attempt_count once; backoff from new count.

 *

 * @param {{ deadLetterReason?: string }} [opts] reason when moving to `dead`

 * @returns {'retry'|'exhausted'}

 */

export async function finalizeOutboundFailedDispatch(db, row, opts = {}) {

  const id = row?.id;

  if (id == null) throw new Error('finalizeOutboundFailedDispatch: row.id required');



  const prior = Number(row.attempt_count) || 0;

  /** attempt_count AFTER this failure */

  const nextCount = prior + 1;

  const seconds = computeRetryBackoffSeconds(nextCount);

  const deadReason = String(opts.deadLetterReason || 'retry_exhausted').trim() || 'retry_exhausted';



  if (seconds == null) {

    await db.query(

      `UPDATE outbound_domain_events

       SET status = 'dead',

           attempt_count = $2::int,

           dead_letter_reason = $3::text,

           next_attempt_at = NOW(),

           updated_at = NOW()

       WHERE id = $1::bigint

         AND status = 'sending'`,

      [Number(id), nextCount, deadReason],

    );

    return 'exhausted';

  }



  await db.query(

    `UPDATE outbound_domain_events

     SET status = 'retry_scheduled',

         attempt_count = $2::int,

         next_attempt_at = NOW() + ($3::bigint * INTERVAL '1 second'),

         updated_at = NOW()

     WHERE id = $1::bigint

       AND status = 'sending'`,

    [Number(id), nextCount, seconds],

  );

  return 'retry';

}


