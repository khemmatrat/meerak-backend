const DEFAULT_REPLAY_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

function toMs(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function toTs(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/**
 * Reject duplicate/stale events before business execution.
 * Uses payment_webhook_event_dedupe table with transaction lock for race safety.
 *
 * @param {import('pg').Pool} pool
 * @param {{
 *   provider: string,
 *   event_id: string,
 *   occurred_at?: string | null,
 *   trace_id?: string | null,
 *   now?: Date
 * }} input
 */
export async function guardWebhookReplay(pool, input) {
  const provider = String(input?.provider || '').trim().toLowerCase();
  const eventId = String(input?.event_id || '').trim();
  const traceId = input?.trace_id ? String(input.trace_id).trim() : null;
  const now = input?.now instanceof Date ? input.now : new Date();

  if (!provider || !eventId) {
    return {
      ok: false,
      rejected: true,
      failure_code: 'missing_replay_key',
      retryable: false,
    };
  }

  const replayWindowMs = toMs(process.env.PAYMENT_WEBHOOK_REPLAY_WINDOW_MS, DEFAULT_REPLAY_WINDOW_MS);
  const occurredAt = toTs(input?.occurred_at);
  if (occurredAt) {
    const delta = Math.abs(now.getTime() - occurredAt.getTime());
    if (delta > replayWindowMs) {
      return {
        ok: false,
        rejected: true,
        failure_code: 'replay_window_exceeded',
        retryable: false,
      };
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${provider}:${eventId}`]);

    const existing = await client.query(
      `SELECT provider, event_id, first_seen_at, last_seen_at, occurred_at, replay_count, last_replay_at
       FROM payment_webhook_event_dedupe
       WHERE provider = $1 AND event_id = $2
       FOR UPDATE`,
      [provider, eventId],
    );

    if (!existing.rows?.length) {
      const inserted = await client.query(
        `INSERT INTO payment_webhook_event_dedupe (
          provider, event_id, first_seen_at, last_seen_at, occurred_at, replay_count, last_replay_at, last_trace_id
        )
        VALUES ($1, $2, NOW(), NOW(), $3::timestamptz, 0, NULL, $4)
        RETURNING provider, event_id, first_seen_at, last_seen_at, occurred_at, replay_count, last_replay_at`,
        [provider, eventId, occurredAt ? occurredAt.toISOString() : null, traceId],
      );
      await client.query('COMMIT');
      return {
        ok: true,
        rejected: false,
        failure_code: null,
        retryable: false,
        dedupe: inserted.rows[0],
      };
    }

    const updated = await client.query(
      `UPDATE payment_webhook_event_dedupe
       SET last_seen_at = NOW(),
           replay_count = replay_count + 1,
           last_replay_at = NOW(),
           last_trace_id = $3
       WHERE provider = $1 AND event_id = $2
       RETURNING provider, event_id, first_seen_at, last_seen_at, occurred_at, replay_count, last_replay_at`,
      [provider, eventId, traceId],
    );
    await client.query('COMMIT');

    return {
      ok: false,
      rejected: true,
      failure_code: 'duplicate_event',
      retryable: false,
      dedupe: updated.rows[0],
    };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

