/**
 * Sink ads outbox events to ClickHouse (HTTP) or local postgres warehouse.
 */

function clickhouseConfigured() {
  return !!(process.env.CLICKHOUSE_URL || process.env.ADS_CLICKHOUSE_URL);
}

export function isClickHouseConfigured() {
  return clickhouseConfigured();
}

function clickhouseUrl() {
  return String(process.env.CLICKHOUSE_URL || process.env.ADS_CLICKHOUSE_URL || '').replace(/\/$/, '');
}

async function sinkToClickHouse(rows) {
  const base = clickhouseUrl();
  if (!base || !rows.length) return { sink: 'clickhouse', inserted: 0 };

  const table = process.env.ADS_CLICKHOUSE_TABLE || 'ads_events';
  const body = rows
    .map((r) =>
      JSON.stringify({
        event_name: r.event_name,
        idempotency_key: r.idempotency_key,
        payload: r.payload_json,
        created_at: r.created_at,
      }),
    )
    .join('\n');

  const url = `${base}/?query=${encodeURIComponent(`INSERT INTO ${table} FORMAT JSONEachRow`)}`;
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.CLICKHOUSE_USER) {
    const auth = Buffer.from(
      `${process.env.CLICKHOUSE_USER}:${process.env.CLICKHOUSE_PASSWORD || ''}`,
    ).toString('base64');
    headers.Authorization = `Basic ${auth}`;
  }

  const res = await fetch(url, { method: 'POST', headers, body });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`clickhouse_insert_failed: ${res.status} ${text.slice(0, 200)}`);
  }
  return { sink: 'clickhouse', inserted: rows.length };
}

async function sinkToPostgresWarehouse(pool, rows) {
  if (!rows.length) return { sink: 'postgres', inserted: 0 };
  let inserted = 0;
  for (const r of rows) {
    const q = await pool.query(
      `INSERT INTO ads_warehouse_events (event_name, idempotency_key, payload, outbox_id, sink)
       VALUES ($1, $2, $3::jsonb, $4, 'postgres')
       ON CONFLICT (event_name, idempotency_key) DO NOTHING`,
      [r.event_name, r.idempotency_key, JSON.stringify(r.payload_json || {}), r.id],
    );
    inserted += q.rowCount || 0;
  }
  return { sink: 'postgres', inserted };
}

export async function sinkAdsOutboxRows(pool, rows) {
  if (!rows?.length) return { inserted: 0, sink: 'none' };
  if (clickhouseConfigured()) {
    try {
      return await sinkToClickHouse(rows);
    } catch (e) {
      console.warn('[adsWarehouse] ClickHouse failed, fallback postgres:', e?.message || e);
    }
  }
  return sinkToPostgresWarehouse(pool, rows);
}
