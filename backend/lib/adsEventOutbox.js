/**
 * Durable ads event outbox — Postgres source of truth for future analytics stream (Kafka/ClickHouse).
 */

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
export async function enqueueAdsOutboxEvent(db, { eventName, idempotencyKey, payload = {} }) {
  if (!db || !eventName || !idempotencyKey) return { enqueued: false, reason: 'missing_params' };
  try {
    const r = await db.query(
      `INSERT INTO ads_event_outbox (event_name, idempotency_key, payload_json)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (event_name, idempotency_key) DO NOTHING
       RETURNING id`,
      [eventName, String(idempotencyKey).slice(0, 200), JSON.stringify(payload)],
    );
    return { enqueued: (r.rowCount || 0) > 0, id: r.rows[0]?.id };
  } catch (e) {
    if (e?.code === '42P01') return { enqueued: false, reason: 'outbox_table_missing' };
    console.warn('[adsOutbox] enqueue failed:', e?.message || e);
    return { enqueued: false, reason: e?.message };
  }
}

export async function getAdsOutboxStats(pool) {
  try {
    const r = await pool.query(
      `SELECT status, COUNT(*)::int AS cnt
       FROM ads_event_outbox
       GROUP BY status`,
    );
    const byStatus = Object.fromEntries(r.rows.map((row) => [row.status, row.cnt]));
    return {
      pending: byStatus.pending || 0,
      dispatched: byStatus.dispatched || 0,
      total: Object.values(byStatus).reduce((s, n) => s + n, 0),
    };
  } catch (e) {
    if (e?.code === '42P01') return { pending: 0, dispatched: 0, total: 0, tableMissing: true };
    return { pending: 0, dispatched: 0, total: 0, error: e?.message };
  }
}
