/**

 * Process ads_event_outbox for analytics warehouse / export pipeline.

 */

import { sinkAdsOutboxRows, isClickHouseConfigured } from './adsClickHouseSink.js';



export async function processAdsOutboxBatch(pool, { limit = 100 } = {}) {

  const client = await pool.connect();

  try {

    const pending = await client.query(

      `SELECT id, event_name, idempotency_key, payload_json, created_at

       FROM ads_event_outbox

       WHERE status = 'pending'

       ORDER BY created_at ASC

       LIMIT $1

       FOR UPDATE SKIP LOCKED`,

      [Math.min(limit, 500)],

    );

    if (!pending.rows.length) return { processed: 0, dispatched: 0 };



    const sinkResult = await sinkAdsOutboxRows(pool, pending.rows).catch((e) => {

      console.warn('[adsOutbox] sink failed:', e?.message || e);

      return { inserted: 0, sink: 'failed' };

    });



    let dispatched = 0;

    for (const row of pending.rows) {

      await client.query(

        `UPDATE ads_event_outbox SET status = 'dispatched', dispatched_at = NOW() WHERE id = $1`,

        [row.id],

      );

      dispatched += 1;

    }

    return {

      processed: pending.rows.length,

      dispatched,

      sink: sinkResult,

      events: pending.rows.map((r) => r.event_name),

    };

  } catch (e) {

    if (e?.code === '42P01') return { processed: 0, dispatched: 0, tableMissing: true };

    throw e;

  } finally {

    client.release();

  }

}



export async function getAdsWarehouseSummary(pool) {

  try {

    const [outbox, outcomes, warehouse] = await Promise.all([

      pool.query(

        `SELECT event_name, COUNT(*)::int AS cnt FROM ads_event_outbox GROUP BY event_name ORDER BY cnt DESC LIMIT 20`,

      ),

      pool.query(

        `SELECT conversion_kind, COUNT(*)::int AS cnt, SUM(cost_micro)::text AS spend_micro

         FROM ad_outcome_billable_log GROUP BY conversion_kind`,

      ).catch(() => ({ rows: [] })),

      pool.query(

        `SELECT sink, COUNT(*)::int AS cnt FROM ads_warehouse_events GROUP BY sink`,

      ).catch(() => ({ rows: [] })),

    ]);

    return {

      outboxByEvent: outbox.rows,

      outcomesByKind: outcomes.rows,

      warehouseBySink: warehouse.rows,

      clickhouse: {
        configured: isClickHouseConfigured(),
        table: process.env.ADS_CLICKHOUSE_TABLE || 'ads_events',
      },

      warehouseReady: true,

    };

  } catch (e) {

    return { warehouseReady: false, error: e?.message };

  }

}


