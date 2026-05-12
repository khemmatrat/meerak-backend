/**
 * Outbound HTTP dispatcher: claim → POST JSON → finalizeSent / finalizeFailed.
 * Set OUTBOUND_DOMAIN_WEBHOOK_URL to enable; otherwise the poller is a no-op.
 */

import {
  claimOutboundEventsForSending,
  finalizeOutboundSent,
  finalizeOutboundFailedDispatch,
  outboundDispatchLogFields,
} from './outboundDomainDispatch.js';

let _missingUrlLogged = false;

function envInt(name, def) {
  const v = parseInt(process.env[name] || '', 10);
  return Number.isFinite(v) && v > 0 ? v : def;
}

function parsePayload(row) {
  const p = row?.payload;
  if (p == null) return {};
  if (typeof p === 'string') {
    try {
      return JSON.parse(p);
    } catch {
      return {};
    }
  }
  return typeof p === 'object' ? p : {};
}

async function postOutboundOnce(destinationUrl, row, timeoutMs) {
  const body = parsePayload(row);
  const headers = {
    'content-type': 'application/json',
    'x-outbound-event': String(row.event_name || ''),
    'x-outbound-idempotency-key': String(row.idempotency_key || ''),
    'x-outbound-event-id': String(row.id || ''),
  };
  if (row.trace_id) headers['x-trace-id'] = String(row.trace_id);
  const tok = String(process.env.OUTBOUND_DOMAIN_WEBHOOK_BEARER_TOKEN || '').trim();
  if (tok) headers.authorization = `Bearer ${tok}`;

  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(destinationUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    return { ok: res.ok, status: res.status };
  } finally {
    clearTimeout(to);
  }
}

/**
 * One poll: claim rows, POST each, finalize by HTTP outcome (2xx → sent).
 *
 * @param {import('pg').Pool} pool
 * @param {{ destinationUrl?: string|null, limit?: number, timeoutMs?: number }} [opts]
 */
export async function runOutboundHttpDispatchTick(pool, opts = {}) {
  if (process.env.OUTBOUND_DOMAIN_DISPATCH_ENABLED === '0') {
    return { skipped: true, reason: 'disabled' };
  }
  const destinationUrl = (opts.destinationUrl || process.env.OUTBOUND_DOMAIN_WEBHOOK_URL || '').trim();
  if (!destinationUrl) {
    if (!_missingUrlLogged && process.env.NODE_ENV !== 'test') {
      _missingUrlLogged = true;
      console.warn(
        '[outboundHttpWorker] OUTBOUND_DOMAIN_WEBHOOK_URL not set — outbound HTTP dispatch idle (outbox still enqueues).',
      );
    }
    return { skipped: true, reason: 'no_outbound_url' };
  }

  const limit = opts.limit ?? envInt('OUTBOUND_DOMAIN_DISPATCH_BATCH', 20);
  const timeoutMs = opts.timeoutMs ?? envInt('OUTBOUND_DOMAIN_WEBHOOK_TIMEOUT_MS', 15_000);
  const rows = await claimOutboundEventsForSending(pool, limit);
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const t0 = Date.now();
    try {
      const { ok, status } = await postOutboundOnce(destinationUrl, row, timeoutMs);
      const latency = Date.now() - t0;
      if (ok) {
        await finalizeOutboundSent(pool, row.id);
        sent += 1;
        console.log(
          JSON.stringify(
            outboundDispatchLogFields(row, {
              result_type: 'outbound_http_sent',
              latency_ms: latency,
              destination: destinationUrl,
            }),
          ),
        );
      } else {
        const hint = `http_${status}`;
        await finalizeOutboundFailedDispatch(pool, row, { deadLetterReason: hint });
        failed += 1;
        console.warn(
          JSON.stringify(
            outboundDispatchLogFields(row, {
              result_type: 'outbound_http_failed',
              latency_ms: latency,
              destination: destinationUrl,
              error: `status ${status}`,
            }),
          ),
        );
      }
    } catch (e) {
      const latency = Date.now() - t0;
      const msg = e?.name === 'AbortError' ? 'timeout' : e?.message || String(e);
      await finalizeOutboundFailedDispatch(pool, row, { deadLetterReason: String(msg).slice(0, 200) });
      failed += 1;
      console.warn(
        JSON.stringify(
          outboundDispatchLogFields(row, {
            result_type: 'outbound_http_error',
            latency_ms: latency,
            destination: destinationUrl,
            error: msg,
          }),
        ),
      );
    }
  }

  return { claimed: rows.length, sent, failed };
}

/** Poll pool on an interval until dispose() (set OUTBOUND_DOMAIN_DISPATCH_MS, default 5000). */
export function startOutboundHttpWorker(pool, opts = {}) {
  if (process.env.OUTBOUND_DOMAIN_DISPATCH_ENABLED === '0') {
    return () => {};
  }
  const intervalMs = Math.max(1000, envInt('OUTBOUND_DOMAIN_DISPATCH_MS', 5000));
  const run = () => {
    runOutboundHttpDispatchTick(pool, opts).catch((e) =>
      console.error('[outboundHttpWorker] tick error', e?.message || e),
    );
  };
  run();
  const id = setInterval(run, intervalMs);
  return () => clearInterval(id);
}
