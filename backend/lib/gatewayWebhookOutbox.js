/**
 * Reliable outbound webhooks — exponential backoff (processed by gatewayScheduler).
 */
import crypto from 'crypto';

const MAX_ATTEMPTS = 12;

function nextBackoffMs(attempt) {
  const base = Math.min(600_000, 1000 * 2 ** Math.min(attempt, 16));
  const jitter = Math.floor(Math.random() * 500);
  return base + jitter;
}

/**
 * @param {import('pg').Pool} pool
 * @param {{
 *   eventType: string,
 *   targetUrl: string,
 *   payload: object,
 *   idempotencyKey?: string | null,
 *   correlationId?: string | null,
 * }} p
 */
export async function enqueueGatewayWebhook(pool, p) {
  const url = String(p.targetUrl || '').trim();
  if (!url.startsWith('http')) return { ok: false, error: 'invalid_url' };
  try {
    const idem = p.idempotencyKey ? String(p.idempotencyKey).trim() : null;
    const corr = p.correlationId || crypto.randomUUID();
    if (idem) {
      const ex = await pool.query(
        `SELECT id FROM gateway_webhook_outbox WHERE idempotency_key = $1 LIMIT 1`,
        [idem]
      );
      if (ex.rows?.[0]) return { ok: true, duplicate: true, id: ex.rows[0].id };
    }
    const r = await pool.query(
      `INSERT INTO gateway_webhook_outbox (event_type, target_url, payload_json, idempotency_key, correlation_id, next_attempt_at, status)
       VALUES ($1, $2, $3::jsonb, $4, $5, NOW(), 'pending')
       RETURNING id`,
      [p.eventType, url, JSON.stringify(p.payload || {}), idem, corr]
    );
    return { ok: true, id: r.rows?.[0]?.id, correlationId: corr };
  } catch (e) {
    if (e && e.code === '42P01') return { ok: false, error: 'table_missing' };
    if (e && e.code === '23505') return { ok: true, duplicate: true };
    throw e;
  }
}

/**
 * Deliver pending rows (call from interval ~60s).
 * @param {import('pg').Pool} pool
 */
export async function processGatewayWebhookOutbox(pool) {
  const secret = (process.env.GATEWAY_WEBHOOK_HMAC_SECRET || process.env.INTERNAL_GATEWAY_HMAC_SECRET || '').trim();
  const rows = await pool
    .query(
      `SELECT id, event_type, target_url, payload_json, attempt_count, correlation_id
       FROM gateway_webhook_outbox
       WHERE status = 'pending' AND next_attempt_at <= NOW()
       ORDER BY next_attempt_at ASC
       LIMIT 25`
    )
    .catch(() => ({ rows: [] }));
  const results = [];
  for (const row of rows.rows || []) {
    const body = JSON.stringify(row.payload_json || {});
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = secret
      ? crypto.createHmac('sha256', secret).update(`${ts}.${body}`, 'utf8').digest('hex')
      : '';
    let httpStatus = 0;
    let errText = '';
    try {
      const res = await fetch(row.target_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-AQOND-Event': row.event_type || '',
          'X-AQOND-Correlation-Id': row.correlation_id || '',
          'X-AQOND-Timestamp': ts,
          ...(sig ? { 'X-AQOND-Signature': sig } : {}),
        },
        body,
        signal: AbortSignal.timeout(25_000),
      });
      httpStatus = res.status;
      if (httpStatus >= 200 && httpStatus < 300) {
        await pool.query(
          `UPDATE gateway_webhook_outbox SET status = 'delivered', last_http_status = $2, last_error = NULL WHERE id = $1::uuid`,
          [row.id, httpStatus]
        );
        results.push({ id: row.id, ok: true });
        continue;
      }
      errText = await res.text().catch(() => '');
    } catch (e) {
      errText = e?.message || String(e);
    }
    const next = (row.attempt_count || 0) + 1;
    if (next >= MAX_ATTEMPTS) {
      await pool.query(
        `UPDATE gateway_webhook_outbox SET status = 'abandoned', attempt_count = $2, last_error = $3, last_http_status = $4
         WHERE id = $1::uuid`,
        [row.id, next, errText.slice(0, 2000), httpStatus || null]
      );
    } else {
      const delay = nextBackoffMs(next);
      await pool.query(
        `UPDATE gateway_webhook_outbox SET attempt_count = $2,
         next_attempt_at = NOW() + ($3::int * INTERVAL '1 millisecond'),
         last_error = $4, last_http_status = $5
         WHERE id = $1::uuid`,
        [row.id, next, Math.min(2147483647, Math.floor(delay)), errText.slice(0, 2000), httpStatus || null]
      );
    }
    results.push({ id: row.id, ok: false, httpStatus });
  }
  return results;
}
