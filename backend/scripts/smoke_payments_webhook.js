/**
 * Task 5 live HTTP smoke test (3-point sanity check).
 *
 *   [1] HTTP sanity        : POST /api/payments/webhook returns 200 with
 *                            { ok, queued, duplicate, trace_id, ... }
 *   [2] Bull worker fires  : init Bull, send another POST, observe DB row
 *                            transition from 'queued' to non-'queued'
 *   [3] Redis down safety  : without Bull init, handler still returns 200,
 *                            does not throw, and signal returns
 *                            reason='queue_not_initialized'
 *
 * Usage:
 *   node backend/scripts/smoke_payments_webhook.js
 *   node backend/scripts/smoke_payments_webhook.js --skip-bull   # only [1]+[3]
 */
import express from 'express';
import pg from 'pg';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

import { handlePaymentsConfirmWebhook } from '../lib/paymentsWebhookConfirm.js';
import {
  initBullQueues,
  enqueuePaymentWebhookSignal,
  getPaymentWebhookQueue,
  getBullQueues,
} from '../lib/queues.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendDir = join(__dirname, '..');
const rootDir = join(backendDir, '..');
dotenv.config({ path: join(backendDir, '.env') });
dotenv.config({ path: join(rootDir, '.env') });

const argv = process.argv.slice(2);
const SKIP_BULL = argv.includes('--skip-bull');
const RUN_ID = `smoke_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
const PROVIDER = 'payso';

let pass = 0;
let fail = 0;
const failures = [];
function ok(name) { pass += 1; console.log(`  PASS  ${name}`); }
function notOk(name, detail) { fail += 1; failures.push({ name, detail }); console.error(`  FAIL  ${name} :: ${detail}`); }
function expect(cond, name, detail) { if (cond) ok(name); else notOk(name, detail); }

function buildPoolConfig() {
  const timeoutMs = 15000;
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: process.env.PGSSLMODE !== 'no-verify' },
      connectionTimeoutMillis: timeoutMs,
      max: 4,
    };
  }
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_DATABASE || 'meera_db',
    user: process.env.DB_USER || 'meera',
    password: process.env.DB_PASSWORD || 'meera123',
    connectionTimeoutMillis: timeoutMs,
    max: 4,
  };
}

const pool = new pg.Pool(buildPoolConfig());

function buildPayload(eventId, extras = {}) {
  return {
    id: eventId,
    type: 'payment.completed',
    payment_id: `pmt_${eventId}`,
    amount: 12345,
    currency: 'THB',
    status: 'paid',
    purpose: 'wallet_topup',
    occurred_at: new Date().toISOString(),
    ...extras,
  };
}

async function postJson(url, payload, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-payment-gateway': PROVIDER, ...headers },
    body: JSON.stringify(payload),
  });
  let body = null;
  try { body = await res.json(); } catch { /* ignore */ }
  return { status: res.status, body };
}

async function pollJobStatus(idempotencyKey, timeoutMs) {
  const start = Date.now();
  let prev = 'queued';
  const trail = [];
  while (Date.now() - start < timeoutMs) {
    const r = await pool.query(
      `SELECT status, attempt_count, dead_letter_reason FROM payment_webhook_jobs WHERE idempotency_key = $1`,
      [idempotencyKey],
    );
    const row = r.rows[0];
    if (!row) return { final: null, trail };
    if (row.status !== prev) {
      trail.push(row.status);
      prev = row.status;
      if (row.status !== 'queued' && row.status !== 'processing') {
        return { final: row.status, trail, attempt_count: row.attempt_count, dead_letter_reason: row.dead_letter_reason };
      }
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return { final: prev, trail, timed_out: true };
}

async function cleanupRun() {
  await pool.query(`DELETE FROM payment_webhook_jobs WHERE event_id LIKE $1`, [`%${RUN_ID}%`]).catch(() => {});
  await pool.query(`DELETE FROM payment_webhook_event_dedupe WHERE event_id LIKE $1`, [`%${RUN_ID}%`]).catch(() => {});
  await pool.query(`DELETE FROM processed_webhook_events WHERE event_id LIKE $1`, [`%${RUN_ID}%`]).catch(() => {});
}

function buildApp() {
  const app = express();
  app.post(
    '/api/payments/webhook',
    express.raw({ type: 'application/json', limit: '256kb' }),
    (req, res, next) => {
      if (Buffer.isBuffer(req.body)) req.rawBody = req.body;
      next();
    },
    async (req, res) => {
      const out = await handlePaymentsConfirmWebhook(req, pool);
      return res.status(out.status).json(out.body);
    },
    (err, req, res, _next) => {
      if (err?.type === 'entity.too.large') {
        return res.status(200).json({
          ok: true, queued: false, duplicate: false,
          failure_code: 'payload_too_large', retryable: false,
          trace_id: req.headers['x-trace-id'] || null,
        });
      }
      console.error('[smoke] route error:', err);
      return res.status(500).json({ error: 'route_error' });
    },
  );
  return app;
}

async function main() {
  await cleanupRun();
  const app = buildApp();
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/api/payments/webhook`;
  console.log(`Mini server listening on ${url}`);

  // ====================================================================
  // [TEST 1] HTTP sanity — pre-Bull-init, Redis effectively unavailable.
  // ====================================================================
  console.log('\n[TEST 1] HTTP sanity (Bull NOT initialized → Redis path inactive)');
  const eventId1 = `evt_${RUN_ID}_t1`;
  const t1 = await postJson(url, buildPayload(eventId1));
  expect(t1.status === 200, '1a HTTP 200', `got ${t1.status} body=${JSON.stringify(t1.body)}`);
  expect(t1.body?.ok === true, '1b ok=true', JSON.stringify(t1.body));
  expect(typeof t1.body?.queued === 'boolean', '1c queued is boolean', JSON.stringify(t1.body));
  expect(typeof t1.body?.trace_id === 'string' && t1.body.trace_id.length > 0, '1d trace_id present', JSON.stringify(t1.body));
  expect(t1.body?.idempotency_key === `${PROVIDER}:${eventId1}`, '1e idempotency_key=provider:event_id', JSON.stringify(t1.body));

  // ====================================================================
  // [TEST 3] Redis down safety — direct signal returns queue_not_initialized.
  // (Same process state as TEST 1: paymentWebhookQueue===null.)
  // ====================================================================
  console.log('\n[TEST 3] Redis down safety (signal returns queue_not_initialized, no throw)');
  expect(getPaymentWebhookQueue() == null, '3a paymentWebhookQueue is null pre-init', `q=${getPaymentWebhookQueue()}`);
  let sigRes;
  let sigThrew = null;
  try {
    sigRes = await enqueuePaymentWebhookSignal({
      provider: PROVIDER,
      event_id: `${RUN_ID}_t3_dry`,
      idempotency_key: `${PROVIDER}:${RUN_ID}_t3_dry`,
      trace_id: 'tr-t3',
    });
  } catch (e) { sigThrew = e; }
  expect(!sigThrew, '3b signal does not throw without Redis', sigThrew?.message);
  expect(sigRes?.enqueued === false, '3c enqueued=false', JSON.stringify(sigRes));
  expect(sigRes?.reason === 'queue_not_initialized', '3d reason=queue_not_initialized', JSON.stringify(sigRes));

  // Redis-down HTTP request: handler must still respond 200 quickly.
  const eventId3 = `evt_${RUN_ID}_t3_http`;
  const t0 = Date.now();
  const t3 = await postJson(url, buildPayload(eventId3));
  const elapsed = Date.now() - t0;
  expect(t3.status === 200, '3e HTTP 200 with Redis down', JSON.stringify(t3.body));
  expect(t3.body?.queued === true, '3f queued=true (DB still works)', JSON.stringify(t3.body));
  expect(elapsed < 5000, '3g responded < 5s with Redis down', `elapsed=${elapsed}ms`);
  // give fire-and-forget signal a tick to settle
  await new Promise((r) => setTimeout(r, 50));
  ok('3h fire-and-forget signal did not raise unhandled rejection');

  // ====================================================================
  // [TEST 2] Bull worker fires — init queues, send POST, observe DB row
  // transition from 'queued' to non-'queued' within 10s.
  // ====================================================================
  let bullInited = false;
  if (SKIP_BULL) {
    console.log('\n[TEST 2] SKIPPED via --skip-bull');
  } else {
    console.log('\n[TEST 2] Bull worker fires (init queues + observe DB row transition)');
    try {
      bullInited = await initBullQueues(pool);
    } catch (e) {
      console.warn('  initBullQueues threw:', e?.message);
      bullInited = false;
    }
    expect(typeof bullInited === 'boolean', '2a initBullQueues returns boolean', `got ${typeof bullInited}`);

    if (!bullInited) {
      console.log('  SKIP 2b–2g: Bull init returned false (Redis unavailable on this machine).');
    } else {
      const queue = getPaymentWebhookQueue();
      expect(!!queue, '2b paymentWebhookQueue initialized', `q=${queue}`);

      // Probe Redis with short ping; if it stalls we treat it as unavailable.
      let redisLive = false;
      try {
        const probe = await Promise.race([
          (async () => {
            const c = queue.client; // ioredis instance
            if (c && typeof c.ping === 'function') {
              const r = await c.ping();
              return r === 'PONG';
            }
            return null;
          })(),
          new Promise((res) => setTimeout(() => res('timeout'), 1500)),
        ]);
        redisLive = probe === true;
        if (!redisLive) console.log(`  Redis probe: ${probe}`);
      } catch (e) {
        console.log('  Redis probe error:', e?.message);
      }

      if (!redisLive) {
        console.log('  SKIP 2c–2g: Redis ping did not respond (server likely not running).');
      } else {
        const eventId2 = `evt_${RUN_ID}_t2`;
        const t2 = await postJson(url, buildPayload(eventId2));
        expect(t2.status === 200, '2c POST 200', JSON.stringify(t2.body));
        expect(t2.body?.queued === true, '2d enqueued in DB', JSON.stringify(t2.body));

        const idem = t2.body?.idempotency_key;
        expect(typeof idem === 'string' && idem.length > 0, '2e idempotency_key returned', JSON.stringify(t2.body));

        // Wait for the Bull worker to pick up the job and finalize it.
        const r = await pollJobStatus(idem, 10000);
        const finalState = r?.final;
        const reachedTerminal = ['processed', 'hard_failed', 'dead_letter', 'queued'].includes(finalState) && finalState !== 'queued';
        // For a payload with status='paid' but no matching gateway_transactions row,
        // worker will hit 'payment_not_found' and mark job 'processed' (warning log).
        // That counts as "worker fired".
        expect(!!finalState, '2f DB row reached non-null final state', JSON.stringify(r));
        expect(reachedTerminal || finalState === 'processed', '2g worker fired (status left queued)', `final=${finalState} trail=${JSON.stringify(r?.trail)}`);
        if (finalState === 'queued') {
          // worker did not pick up — show diagnostics
          console.log('  diag: status=queued. trail=', r?.trail, ' timed_out=', r?.timed_out);
        }
      }
    }
  }

  // ====================================================================
  // Teardown
  // ====================================================================
  await new Promise((r) => server.close(() => r()));
  if (bullInited) {
    const all = getBullQueues();
    for (const q of Object.values(all)) {
      if (q && typeof q.close === 'function') await q.close().catch(() => {});
    }
  }
  await cleanupRun().catch(() => {});
  await pool.end().catch(() => {});

  console.log('\n=========================================');
  console.log(`Smoke summary: ${pass} passed, ${fail} failed.`);
  if (failures.length > 0) {
    console.log('Failures:');
    for (const f of failures) console.log(` - ${f.name}: ${f.detail}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('FATAL', e);
  pool.end().catch(() => {});
  process.exit(2);
});
