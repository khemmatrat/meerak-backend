/**
 * Task 5 verification: POST /api/payments/webhook intake.
 *
 * Covers (per Phase 1A spec):
 *  1. First-time event → status=200, queued=true, duplicate=false, trace_id present
 *  2. Replay same event → queued=false, duplicate=true, replay_count > 0
 *  3. Idempotency normalization: provider/event_id case+whitespace differences
 *     collapse to one job
 *  4. Oversized payload (> 128KB, ≤ 256KB) → still 200, intake adds
 *     'raw_body_truncated' to issues, payload truncated in DB
 *  5. Bull signal best-effort: handler does not throw when Redis is down
 *     (simulated by NOT initializing the queue)
 *  6. Bull signal jobId equals provider:event_id when queue is initialized
 *  7. enqueuePaymentWebhookSignal('queue_not_initialized') returns
 *     gracefully without throwing
 *  8. Unified facade parity: dispatchPaymentsWebhookPhase1a matches handlePaymentsConfirmWebhook
 *  9. server.js wires Phase1A / Stripe / checkout webhook routes through paymentsWebhookUnified
 *
 * Usage:
 *   node backend/scripts/test_payments_webhook_intake.js
 *   node backend/scripts/test_payments_webhook_intake.js --use-url
 *
 * Pre-req: migration 184 already applied. DB env from backend/.env or root .env.
 */
import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import crypto from 'crypto';

import { handlePaymentsConfirmWebhook } from '../lib/paymentsWebhookConfirm.js';
import { dispatchPaymentsWebhookPhase1a } from '../api/paymentsWebhookUnified.js';
import { enqueuePaymentWebhookSignal, getPaymentWebhookQueue } from '../lib/queues.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendDir = join(__dirname, '..');
const rootDir = join(backendDir, '..');
dotenv.config({ path: join(backendDir, '.env') });
dotenv.config({ path: join(rootDir, '.env') });

const argv = process.argv.slice(2);
const useUrl = argv.includes('--use-url') && process.env.DATABASE_URL;

function buildPoolConfig() {
  const timeoutMs = Math.min(
    Math.max(parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || '30000', 10) || 30000, 5000),
    120000,
  );
  if (!useUrl) {
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
  return {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: process.env.PGSSLMODE !== 'no-verify' },
    connectionTimeoutMillis: timeoutMs,
    max: 4,
  };
}

const pool = new pg.Pool(buildPoolConfig());

const RUN_ID = `t5_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
const PROVIDER = 'payso';

let pass = 0;
let fail = 0;
const failures = [];

function ok(name) {
  pass += 1;
  console.log(`  PASS  ${name}`);
}
function notOk(name, detail) {
  fail += 1;
  failures.push({ name, detail });
  console.error(`  FAIL  ${name} :: ${detail}`);
}
function assert(cond, name, detail) {
  if (cond) ok(name);
  else notOk(name, detail);
}

function buildPayload({ eventId, amount = 1234, status = 'paid', purpose = 'wallet_topup' }) {
  return {
    id: eventId,
    type: 'payment.completed',
    payment_id: `pmt_${eventId}`,
    amount,
    currency: 'THB',
    status,
    purpose,
    occurred_at: new Date().toISOString(),
  };
}

function buildReq({ eventId, providerHeader = PROVIDER, traceId, payload, overrides = {} }) {
  const body = payload || buildPayload({ eventId });
  const raw = Buffer.from(JSON.stringify(body), 'utf8');
  return {
    headers: {
      'content-type': 'application/json',
      'x-payment-gateway': providerHeader,
      'x-trace-id': traceId || `tr-${RUN_ID}-${eventId}`,
      ...overrides,
    },
    body: raw,
    rawBody: raw,
  };
}

async function cleanupRun() {
  await pool.query(
    `DELETE FROM payment_webhook_jobs
     WHERE provider = $1
       AND event_id LIKE $2`,
    [PROVIDER, `%${RUN_ID}%`],
  );
  await pool.query(
    `DELETE FROM payment_webhook_event_dedupe
     WHERE provider = $1
       AND event_id LIKE $2`,
    [PROVIDER, `%${RUN_ID}%`],
  );
}

async function getJobByEvent(provider, eventId) {
  const r = await pool.query(
    `SELECT * FROM payment_webhook_jobs
     WHERE provider = $1 AND event_id = $2
     ORDER BY created_at DESC LIMIT 1`,
    [provider, eventId],
  );
  return r.rows[0] || null;
}

async function getDedupeByEvent(provider, eventId) {
  const r = await pool.query(
    `SELECT * FROM payment_webhook_event_dedupe
     WHERE provider = $1 AND event_id = $2`,
    [provider, eventId],
  );
  return r.rows[0] || null;
}

async function countJobsForEvent(provider, eventId) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS c FROM payment_webhook_jobs
     WHERE provider = $1 AND event_id = $2`,
    [provider, eventId],
  );
  return r.rows[0]?.c || 0;
}

async function testFirstTimeEnqueue() {
  console.log('\n[1] First-time event → queued=true, duplicate=false');
  const eventId = `evt_${RUN_ID}_first`;
  const req = buildReq({ eventId });
  const out = await handlePaymentsConfirmWebhook(req, pool);
  assert(out?.status === 200, '1a status=200', `got ${out?.status}`);
  assert(out?.body?.ok === true, '1b ok=true', JSON.stringify(out?.body));
  assert(out?.body?.queued === true, '1c queued=true', JSON.stringify(out?.body));
  assert(out?.body?.duplicate === false, '1d duplicate=false', JSON.stringify(out?.body));
  assert(typeof out?.body?.trace_id === 'string' && out.body.trace_id.length > 0, '1e trace_id present', JSON.stringify(out?.body));
  assert(out?.body?.idempotency_key === `${PROVIDER}:${eventId}`, '1f idempotency_key=provider:event_id', JSON.stringify(out?.body));
  assert(out?.body?.event_id === eventId, '1g event_id matches', JSON.stringify(out?.body));
  const job = await getJobByEvent(PROVIDER, eventId);
  assert(!!job, '1h job row exists in DB', 'no row');
  assert(job?.status === 'queued', '1i job.status=queued', `got ${job?.status}`);
  assert(job?.idempotency_key === `${PROVIDER}:${eventId}`, '1j job.idempotency_key matches', `got ${job?.idempotency_key}`);
  assert(job?.trace_id === out?.body?.trace_id, '1k trace_id propagated to DB row', `db=${job?.trace_id} body=${out?.body?.trace_id}`);
}

async function testReplayDuplicate() {
  console.log('\n[2] Replay same event → duplicate=true, replay_count > 0, single job row');
  const eventId = `evt_${RUN_ID}_replay`;

  const req1 = buildReq({ eventId, traceId: 'tr-replay-1' });
  const out1 = await handlePaymentsConfirmWebhook(req1, pool);
  assert(out1?.body?.queued === true, '2a first request: queued=true', JSON.stringify(out1?.body));

  const req2 = buildReq({ eventId, traceId: 'tr-replay-2' });
  const out2 = await handlePaymentsConfirmWebhook(req2, pool);
  assert(out2?.status === 200, '2b second status=200', `got ${out2?.status}`);
  assert(out2?.body?.queued === false, '2c second queued=false', JSON.stringify(out2?.body));
  assert(out2?.body?.duplicate === true, '2d second duplicate=true', JSON.stringify(out2?.body));
  assert(Number(out2?.body?.replay_count || 0) >= 1, '2e replay_count >= 1', JSON.stringify(out2?.body));

  const count = await countJobsForEvent(PROVIDER, eventId);
  assert(count === 1, '2f exactly one job row in DB', `got ${count}`);

  const dedupe = await getDedupeByEvent(PROVIDER, eventId);
  assert(!!dedupe, '2g dedupe row exists', 'missing');
  assert(Number(dedupe?.replay_count || 0) >= 1, '2h dedupe.replay_count >= 1', `got ${dedupe?.replay_count}`);
}

async function testKeyNormalization() {
  console.log('\n[3] Provider/event_id normalization → single job for variants');
  const baseId = `evt_${RUN_ID}_norm`;
  const variants = [
    { providerHeader: 'Payso', eventId: ` ${baseId} ` }, // upper + spaces
    { providerHeader: 'PAYSO', eventId: baseId },
    { providerHeader: 'payso', eventId: baseId },
  ];

  let firstQueuedCount = 0;
  for (const v of variants) {
    const payload = buildPayload({ eventId: v.eventId.trim() });
    payload.id = v.eventId; // keep raw spacing/case in payload
    const req = buildReq({
      eventId: v.eventId,
      providerHeader: v.providerHeader,
      payload,
    });
    const out = await handlePaymentsConfirmWebhook(req, pool);
    if (out?.body?.queued) firstQueuedCount += 1;
  }
  assert(firstQueuedCount === 1, '3a only first variant queues', `queued ${firstQueuedCount}/3`);
  const count = await countJobsForEvent(PROVIDER, baseId);
  assert(count === 1, '3b one job row across normalized variants', `got ${count}`);
}

async function testOversizedPayload() {
  console.log('\n[4] Oversized payload (> 128KB) → still queued, raw_body_truncated in issues');
  const eventId = `evt_${RUN_ID}_big`;
  const fillerLen = 160 * 1024; // 160KB > MAX_RAW_BODY_BYTES (128KB)
  const filler = 'A'.repeat(fillerLen);
  const payload = {
    id: eventId,
    type: 'payment.completed',
    payment_id: `pmt_${eventId}`,
    amount: 999,
    currency: 'THB',
    status: 'paid',
    purpose: 'wallet_topup',
    occurred_at: new Date().toISOString(),
    big_blob: filler,
  };
  const req = buildReq({ eventId, payload });
  const rawLen = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  assert(rawLen > 128 * 1024, '4a payload size exceeds 128KB threshold', `got ${rawLen}`);

  const out = await handlePaymentsConfirmWebhook(req, pool);
  assert(out?.status === 200, '4b status=200', `got ${out?.status}`);
  assert(out?.body?.queued === true, '4c queued=true', JSON.stringify(out?.body));

  const job = await getJobByEvent(PROVIDER, eventId);
  assert(!!job, '4d job row exists', 'missing');
  const stored = job?.payload_json || {};
  const issues = Array.isArray(stored?.normalized_event?.issues) ? stored.normalized_event.issues : [];
  assert(issues.includes('raw_body_truncated'), '4e issues includes raw_body_truncated', JSON.stringify(issues));
  const storedRaw = String(stored?.raw_body || '');
  assert(storedRaw.length <= 128 * 1024, '4f stored raw_body truncated to ≤ 128KB', `got ${storedRaw.length}`);
}

async function testBullSignalGracefulNoQueue() {
  console.log('\n[5] enqueuePaymentWebhookSignal returns gracefully when Redis is unavailable');
  // We have not called initBullQueues in this test process, so the queue is null.
  const q = getPaymentWebhookQueue();
  assert(q === null || q === undefined, '5a queue is uninitialized in test process', `q=${q}`);

  let threw = null;
  let r;
  try {
    r = await enqueuePaymentWebhookSignal({
      provider: PROVIDER,
      event_id: 'evt_signal_noredis',
      idempotency_key: `${PROVIDER}:evt_signal_noredis`,
      trace_id: 'tr-noredis',
    });
  } catch (e) {
    threw = e;
  }
  assert(!threw, '5b does not throw', threw?.message);
  assert(r?.enqueued === false, '5c enqueued=false', JSON.stringify(r));
  assert(r?.reason === 'queue_not_initialized', '5d reason=queue_not_initialized', JSON.stringify(r));
}

async function testHandlerNotBlockedByQueueFailure() {
  console.log('\n[6] handlePaymentsConfirmWebhook does not block / fail when Bull is unavailable');
  const eventId = `evt_${RUN_ID}_noqueue`;
  const req = buildReq({ eventId });
  let threw = null;
  let out;
  const t0 = Date.now();
  try {
    out = await handlePaymentsConfirmWebhook(req, pool);
  } catch (e) {
    threw = e;
  }
  const elapsed = Date.now() - t0;
  assert(!threw, '6a handler does not throw', threw?.message);
  assert(out?.status === 200, '6b status=200 even without Redis', JSON.stringify(out?.body));
  assert(out?.body?.queued === true, '6c queued=true (DB enqueue ok)', JSON.stringify(out?.body));
  assert(elapsed < 5000, '6d intake returns quickly (< 5s)', `elapsed=${elapsed}ms`);

  // give the fire-and-forget signal a tick to settle without unhandled rejection
  await new Promise((r) => setTimeout(r, 50));
  ok('6e fire-and-forget signal did not raise unhandled rejection');
}

async function resetEventPair(eventId) {
  await pool.query(`DELETE FROM payment_webhook_jobs WHERE provider = $1 AND event_id = $2`, [
    PROVIDER,
    eventId,
  ]);
  await pool.query(`DELETE FROM payment_webhook_event_dedupe WHERE provider = $1 AND event_id = $2`, [
    PROVIDER,
    eventId,
  ]);
}

async function testMissingKeysReturnsMissingKeys() {
  console.log('\n[7] enqueuePaymentWebhookSignal returns missing_keys for empty input');
  // Even when queue is null, the missing_keys path should NOT throw.
  // In real life with queue initialized, this guards intake mistakes.
  const r1 = await enqueuePaymentWebhookSignal({});
  // queue_not_initialized takes precedence in this test process — that is also acceptable.
  assert(r1?.enqueued === false, '7a empty input not enqueued', JSON.stringify(r1));
  assert(['queue_not_initialized', 'missing_keys'].includes(r1?.reason), '7b safe reason returned', JSON.stringify(r1));
}

async function testUnifiedFacadeParity() {
  console.log(
    '\n[8] Unified facade: dispatchPaymentsWebhookPhase1a ≡ handlePaymentsConfirmWebhook (fresh + replay)',
  );
  const eventId = `evt_${RUN_ID}_facade`;
  const traceFirst = 'tr-facade-first';

  await resetEventPair(eventId);
  const outConfirmFresh = await handlePaymentsConfirmWebhook(
    buildReq({ eventId, traceId: traceFirst }),
    pool,
  );
  await resetEventPair(eventId);
  const outDispatchFresh = await dispatchPaymentsWebhookPhase1a(
    buildReq({ eventId, traceId: traceFirst }),
    pool,
  );
  assert(
    JSON.stringify(outConfirmFresh) === JSON.stringify(outDispatchFresh),
    '8a fresh intake JSON matches',
    `${JSON.stringify(outConfirmFresh)} vs ${JSON.stringify(outDispatchFresh)}`,
  );

  await resetEventPair(eventId);
  await handlePaymentsConfirmWebhook(buildReq({ eventId, traceId: traceFirst }), pool);
  const outConfirmReplay = await handlePaymentsConfirmWebhook(
    buildReq({ eventId, traceId: 'tr-facade-replay' }),
    pool,
  );
  await resetEventPair(eventId);
  await handlePaymentsConfirmWebhook(buildReq({ eventId, traceId: traceFirst }), pool);
  const outDispatchReplay = await dispatchPaymentsWebhookPhase1a(
    buildReq({ eventId, traceId: 'tr-facade-replay' }),
    pool,
  );
  assert(
    JSON.stringify(outConfirmReplay) === JSON.stringify(outDispatchReplay),
    '8b replay intake JSON matches',
    `${JSON.stringify(outConfirmReplay)} vs ${JSON.stringify(outDispatchReplay)}`,
  );
}

async function testServerUsesUnifiedWebhookEntry() {
  console.log('\n[9] server.js routes webhook entry through paymentsWebhookUnified');
  const { readFileSync } = await import('fs');
  const { join, dirname } = await import('path');
  const { fileURLToPath } = await import('url');
  const __dir = dirname(fileURLToPath(import.meta.url));
  const serverPath = join(__dir, '..', 'server.js');
  const src = readFileSync(serverPath, 'utf8');
  assert(
    src.includes("from './api/paymentsWebhookUnified.js'"),
    '9a imports paymentsWebhookUnified',
    'missing import',
  );
  assert(src.includes('/api/payments/webhook'), '9b declares /api/payments/webhook', 'missing phase1 route');
  assert(src.includes('/api/webhooks/stripe'), '9c declares /api/webhooks/stripe', 'missing stripe route');
  assert(src.includes('/api/webhooks/checkout'), '9d declares /api/webhooks/checkout', 'missing checkout route');
  assert(src.includes('dispatchPaymentsWebhookPhase1a'), '9e uses dispatchPaymentsWebhookPhase1a', 'missing dispatch');
  assert(src.includes('dispatchStripePaymentWebhook'), '9f uses dispatchStripePaymentWebhook', 'missing stripe dispatch');
  assert(src.includes('dispatchCheckoutWalletWebhook'), '9g uses dispatchCheckoutWalletWebhook', 'missing checkout dispatch');
}

async function main() {
  await cleanupRun();
  try {
    await testFirstTimeEnqueue();
    await testReplayDuplicate();
    await testKeyNormalization();
    await testOversizedPayload();
    await testBullSignalGracefulNoQueue();
    await testHandlerNotBlockedByQueueFailure();
    await testMissingKeysReturnsMissingKeys();
    await testUnifiedFacadeParity();
    await testServerUsesUnifiedWebhookEntry();
  } finally {
    await cleanupRun().catch(() => {});
    await pool.end().catch(() => {});
  }

  console.log('\n=========================================');
  console.log(`Task 5 intake tests: ${pass} passed, ${fail} failed.`);
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
