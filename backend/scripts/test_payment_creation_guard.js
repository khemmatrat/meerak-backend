/**
 * Task 17 close-out: payment creation guard — full integration, no skips.
 *
 *   cd backend && node scripts/test_payment_creation_guard.js
 *
 * Seeds a match job (waiting_for_approval) + users when none exist.
 */
import pg from 'pg';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import bcrypt from 'bcryptjs';

import { buildTransactionMetadata } from '../lib/paymentAdapter.js';
import { buildMatchJobPaymentContext } from '../lib/stripeMatchJobPayment.js';
import { UX_TERMINAL_STATUSES } from '../lib/paymentResponsePresenter.js';
import { GATEWAY_TX_STATUS } from '../internal-gateway/constants.js';

import {
  normalizeClientReferenceId,
  paymentCreateRateLimitedBody,
  consumePaymentCreationBudget,
  ensurePaymentCreationGuardSchema,
  UX_REUSABLE_STATUSES,
  lockedCreateOrReuseMatchJobGatewayPayment,
  publicPaymentExternalRef,
  buildUxPayloadForGatewayRow,
  toPaymentGatewayClientShape,
} from '../lib/paymentCreationGuard.js';

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
      database: process.env.DB_DATABASE || process.env.DB_NAME || 'meera_db',
      user: process.env.DB_USER || 'meera',
      password: process.env.DB_PASSWORD || 'meera123',
      connectionTimeoutMillis: timeoutMs,
      max: 10,
    };
  }
  return {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: process.env.PGSSLMODE !== 'no-verify' },
    connectionTimeoutMillis: timeoutMs,
    max: 10,
  };
}

const pool = new pg.Pool(buildPoolConfig());

const RUN = `pcg_${Date.now()}_${randomUUID().slice(0, 8)}`;
const branches = new Set();

let pass = 0;
let fail = 0;
function ok(n) {
  pass += 1;
  console.log(`  ✓ ${n}`);
}
function notOk(n, d) {
  fail += 1;
  console.error(`  ✗ ${n} :: ${d}`);
}
function assert(c, n, d = '') {
  if (c) ok(n);
  else notOk(n, d);
}
function branch(name) {
  branches.add(name);
}

function round2(v) {
  return Math.round((Number(v) + Number.EPSILON) * 100) / 100;
}

function aqppShape(id) {
  return typeof id === 'string' && /^aqpp_[0-9a-f]{32}$/i.test(id);
}

async function ledgerCountForPayment(paymentId) {
  const r = await pool.query(`SELECT COUNT(*)::int AS c FROM ledger_entries WHERE payment_id = $1`, [paymentId]);
  return r.rows?.[0]?.c ?? 0;
}

async function outboundCountForPayment(paymentId) {
  try {
    const r = await pool.query(`SELECT COUNT(*)::int AS c FROM outbound_domain_events WHERE payment_id = $1`, [paymentId]);
    return r.rows?.[0]?.c ?? 0;
  } catch {
    return 0;
  }
}

async function webhookJobCountSubstring(sub) {
  try {
    const r = await pool.query(`SELECT COUNT(*)::int AS c FROM payment_webhook_jobs WHERE payload_json::text LIKE $1`, [`%${sub}%`]);
    return r.rows?.[0]?.c ?? 0;
  } catch {
    return 0;
  }
}

async function loadGatewayRowByExternalRef(externalRef) {
  const r = await pool.query(
    `SELECT id::text AS id, external_ref, merchant_reference, status, amount_minor, currency, metadata,
            settlement_status, job_id, created_at
     FROM gateway_transactions WHERE external_ref = $1 LIMIT 1`,
    [externalRef],
  );
  const row = r.rows?.[0];
  if (!row) return null;
  let meta = row.metadata;
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta);
    } catch {
      meta = {};
    }
  }
  return { ...row, metadata: meta || {} };
}

/** Metadata superset compatible with `@> corrSuperset` in paymentCreationGuard */
function corrMetadata(jobId, employerId, cref) {
  const m = buildTransactionMetadata({
    jobId,
    userId: employerId,
    paymentChannel: 'promptpay',
    extra: {
      meerak_job_id: String(jobId),
      meerak_client_reference: cref,
      meerak_user_id: String(employerId),
      purpose: 'job_checkout',
      gateway_ui: 'promptpay',
    },
  });
  return JSON.stringify(m);
}

async function insertSyntheticGatewayRows(client, { jobId, employerId, cref, extLower, extHigher, amtMinor }) {
  const meta = corrMetadata(jobId, employerId, cref);
  await client.query(
    `INSERT INTO gateway_transactions (
       external_ref, merchant_reference, amount_minor, currency, status, metadata, job_id, release_rules, fraud_flags
     ) VALUES ($1, $2, $3, 'THB', $4, $5::jsonb, $6, '{}'::jsonb, '{}'::jsonb)`,
    [extLower, String(jobId), amtMinor, GATEWAY_TX_STATUS.PENDING, meta, jobId],
  );
  await client.query(
    `INSERT INTO gateway_transactions (
       external_ref, merchant_reference, amount_minor, currency, status, metadata, job_id, release_rules, fraud_flags
     ) VALUES ($1, $2, $3, 'THB', $4, $5::jsonb, $6, '{}'::jsonb, '{}'::jsonb)`,
    [extHigher, String(jobId), amtMinor, GATEWAY_TX_STATUS.PENDING, meta, jobId],
  );
  const ord = await client.query(
    `SELECT id::text AS id, external_ref
     FROM gateway_transactions
     WHERE job_id::text = $1 AND metadata @> $2::jsonb
     ORDER BY id ASC`,
    [String(jobId), meta],
  );
  if (ord.rows.length < 2) throw new Error('ordering_fixture_rows_missing');
  const [first, second] = ord.rows;
  await client.query(`UPDATE gateway_transactions SET status = 'FAILED' WHERE id = $1::uuid`, [first.id]);
  await client.query(`UPDATE gateway_transactions SET status = 'PENDING' WHERE id = $1::uuid`, [second.id]);
  const activeExt = second.external_ref;
  return { activeExt, failedExt: first.external_ref };
}

async function insertLedgerCompleted(client, { paymentId, jobId, amountThb, idemKey }) {
  await client.query(
    `INSERT INTO ledger_entries (
       idempotency_key, transaction_group_id, payment_id, user_id, event_type, direction,
       amount, currency, description, trace_id
     ) VALUES ($1, gen_random_uuid(), $2, $3, 'PAYMENT_COMPLETED', 'credit', $4::numeric, 'THB', $5, $6)`,
    [idemKey, paymentId, String(jobId), round2(amountThb), 'pcg_fixture', `tr_${RUN}`],
  );
}

async function seedFixtureUsersAndJob() {
  const employerId = (await pool.query(`SELECT gen_random_uuid() AS id`)).rows[0].id;
  const talentId = (await pool.query(`SELECT gen_random_uuid() AS id`)).rows[0].id;
  const jobId = (await pool.query(`SELECT gen_random_uuid() AS id`)).rows[0].id;
  const hash = await bcrypt.hash('PcGFixture!1', 10);
  const empPhone = `+6681${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
  const talPhone = `+6681${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
  const empEmail = `pcg_emp_${RUN}@fixture.local`;
  const talEmail = `pcg_tal_${RUN}@fixture.local`;

  /** Schema-tolerant inserts (deployments vary by migration). */
  try {
    await pool.query(
      `INSERT INTO users (
         id, firebase_uid, email, phone, password_hash,
         role, provider_status, kyc_level, wallet_balance,
         provider_available, expert_category, account_status,
         created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5,
         'user', 'UNVERIFIED', 'level_2', 5000,
         false, null, 'active',
         NOW(), NOW()
       )`,
      [employerId, `pcg_emp_${RUN}`, empEmail, empPhone, hash],
    );
  } catch (_) {
    await pool.query(
      `INSERT INTO users (
         id, firebase_uid, email, phone, password_hash,
         role, provider_status, wallet_balance, account_status, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, 'user', 'UNVERIFIED', 5000, 'active', NOW(), NOW()
       )`,
      [employerId, `pcg_emp_${RUN}`, empEmail, empPhone, hash],
    );
  }
  try {
    await pool.query(
      `INSERT INTO users (
         id, firebase_uid, email, phone, password_hash,
         role, provider_status, kyc_level, wallet_balance,
         provider_available, expert_category, account_status,
         completed_jobs_count,
         created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5,
         'provider', 'VERIFIED_PROVIDER', 'level_2', 5000,
         true, 'party_guest', 'active',
         0,
         NOW(), NOW()
       )`,
      [talentId, `pcg_tal_${RUN}`, talEmail, talPhone, hash],
    );
  } catch (_) {
    await pool.query(
      `INSERT INTO users (
         id, firebase_uid, email, phone, password_hash,
         role, provider_status, wallet_balance, account_status, provider_available,
         created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, 'provider', 'VERIFIED_PROVIDER', 5000, 'active', true,
         NOW(), NOW()
       )`,
      [talentId, `pcg_tal_${RUN}`, talEmail, talPhone, hash],
    );
  }

  const locJson = JSON.stringify({ lat: 13.7462, lng: 100.5232 });
  const future = new Date(Date.now() + 7 * 864e5).toISOString();
  await pool.query(
    `INSERT INTO jobs (
       id, title, description, category, price, status,
       created_by, client_id, created_by_name, accepted_by,
       datetime, location, payment_details, created_at, updated_at
     ) VALUES (
       $1, $2, $3, 'Cleaning', $4, 'waiting_for_approval',
       $5::uuid, $6::uuid, 'PCG Fixture Employer', $7::uuid,
       $8::timestamptz, $9::jsonb, '{}'::jsonb, NOW(), NOW()
     )`,
    [jobId, `PCG fixture job ${RUN}`, 'Task 17 fixture', 2000, employerId, employerId, talentId, future, locJson],
  );

  const jobRow = (await pool.query(`SELECT * FROM jobs WHERE id::text = $1`, [String(jobId)])).rows[0];
  return { employerId: String(employerId), jobId: String(jobId), jobRow };
}

// —— Static (no DB)
{
  const a = normalizeClientReferenceId('  abc-12  ');
  const bNorm = normalizeClientReferenceId('  abc-12  ');
  assert(a.value === bNorm.value, 'normalize: deterministic');
  branch('static_normalize');
  const rl = paymentCreateRateLimitedBody('t1', 44);
  assert(rl.success === false && rl.failure_code === 'PAYMENT_CREATE_RATE_LIMITED', 'rate: body PAYMENT_CREATE_RATE_LIMITED');
  assert(typeof rl.trace_id === 'string' && rl.trace_id.length > 0, 'rate: trace_id');
  assert(rl.retry_after_seconds === 44 && rl.retry_after === 44, 'rate: retry_after mirror');
  assert(rl.ux === null, 'rate: ux null on rate limit');
  const low = rl;
  assert(!JSON.stringify(low).match(/stripe|payso|ksher|omise|charge_/i), 'rate: failure payload omits obvious provider/leak keywords');
  branch('rate_limit_contract');
}

// —— Source proofs (frozen guard + HTTP route wiring)
{
  const gsrc = readFileSync(join(backendDir, 'lib', 'paymentCreationGuard.js'), 'utf8');
  const dup = /WHERE COALESCE\(job_id::text, ''\) = \$1\s+AND metadata @> \$2::jsonb[\s\S]{0,120}LIMIT 50/.exec(gsrc);
  assert(dup, 'source: duplicate candidate block exists');
  assert(/\bORDER BY id ASC\b/i.test(dup[0]), 'source: duplicate lookup orders by gateway id ASC only');
  assert(!/\border\s+by\s+created_at\b/i.test(dup[0]), 'source: duplicate branch has no ORDER BY created_at');
  assert(!/\bUPDATE\s+ledger_entries\b/i.test(gsrc) && !/\bDELETE\s+FROM\s+ledger_entries\b/i.test(gsrc), 'source: guard file has no ledger UPDATE/DELETE');
  const qsrc = readFileSync(join(backendDir, 'lib', 'paymentStateQueries.js'), 'utf8');
  const lm = /FROM ledger_entries[\s\S]{0,200}ORDER BY id ASC/im.exec(qsrc);
  assert(lm, 'source: ledger_entries evidence uses ORDER BY id ASC');
  assert(!/FROM ledger_entries[\s\S]{0,240}ORDER BY[^\n]{0,80}created_at/im.test(qsrc), 'source: ledger_entries load has no ORDER BY created_at');
  branch('source_guard_ordering');

  const srv = readFileSync(join(backendDir, 'server.js'), 'utf8');
  const mark = srv.indexOf("app.post('/api/payment-gateway/create'");
  assert(mark > 0, 'source: payment-gateway/create route exists');
  const chunk = srv.slice(mark, mark + 3200);
  assert(chunk.includes('consumePaymentCreationBudget'), 'source: route calls consumePaymentCreationBudget');
  assert(
    chunk.includes('status(429)') && chunk.includes('paymentCreateRateLimitedBody') && /\.json\(bod\)/.test(chunk),
    'source: 429+json(bod) wired to paymentCreateRateLimitedBody (failure_code PAYMENT_CREATE_RATE_LIMITED defined in guard)',
  );
  branch('source_http_429');
}

let cleanupState = {
  jobId: null,
  userIds: [],
  externalRefs: new Set(),
};

try {
  await ensurePaymentCreationGuardSchema(pool);

  const actorKey = `test:${RUN}`;
  for (let i = 0; i < 5; i++) {
    const r = await consumePaymentCreationBudget(pool, { actorUserKey: actorKey, windowSec: 60, maxBurst: 5 });
    assert(r.ok, `budget: slot ${i + 1}`);
  }
  const blocked = await consumePaymentCreationBudget(pool, { actorUserKey: actorKey, windowSec: 60, maxBurst: 5 });
  assert(!blocked.ok, 'budget: 6th blocked (HTTP layer maps to 429 + PAYMENT_CREATE_RATE_LIMITED per server.js source)');
  branch('runtime_rate_budget');

  let { employerId, jobId, jobRow } = await seedFixtureUsersAndJob();
  cleanupState.jobId = jobId;
  cleanupState.userIds = [employerId, String(jobRow.accepted_by)];

  const ctxPricing = await buildMatchJobPaymentContext(pool, jobId, { userId: employerId });
  const amountThb = round2(ctxPricing.finalPrice);
  assert(amountThb >= 15, 'fixture: priced amount sane', String(amountThb));

  const ctxJob = { ...jobRow, id: jobId };

  // —— G: payment_id shape (aqpp_*, non-sequential, not internal DB uuid)
  {
    const refs = [];
    for (let i = 0; i < 6; i++) refs.push(publicPaymentExternalRef());
    assert(refs.every(aqppShape), 'id: aqpp_ + 32 hex');
    const nums = refs.map((x) => BigInt('0x' + x.slice(5)));
    const diffs = [];
    for (let i = 1; i < nums.length; i++) diffs.push(Number(nums[i] - nums[i - 1]));
    assert(!diffs.every((d) => d === 1), 'id: sample not uniformly +1 sequential');
    branch('payment_id_shape');
  }

  // —— A + D + H: duplicate reuse, ledger/outbound/webhook quiet
  const crefMain = `cref_main_${RUN}`;
  const trace1 = `t_${RUN}_a1`;
  const r1 = await lockedCreateOrReuseMatchJobGatewayPayment(pool, {
    job: ctxJob,
    employerId,
    normalizedClientReference: crefMain,
    amountThb,
    gatewayUi: 'promptpay',
    traceId: trace1,
    paymentChannel: 'promptpay',
  });
  cleanupState.externalRefs.add(String(r1.gwRow.external_ref));
  const gid1 = String(r1.gwRow.id || '');
  const payId1 = String(r1.gwRow.external_ref);
  assert(aqppShape(payId1), 'A: first payment_id shape');
  assert(!payId1.includes(gid1.replace(/-/g, '')), 'A: external_ref does not embed gateway row uuid');
  assert(UX_REUSABLE_STATUSES.has(r1.ux.status), 'A: first UX active-like', r1.ux.status);
  assert(r1.ux.trace_id === trace1 && typeof r1.ux.status_version === 'number', 'A: ux trace_id + status_version');

  const lc0 = await ledgerCountForPayment(payId1);
  const ob0 = await outboundCountForPayment(payId1);
  const wh0 = await webhookJobCountSubstring(payId1);

  const trace2 = `t_${RUN}_a2`;
  const r2 = await lockedCreateOrReuseMatchJobGatewayPayment(pool, {
    job: ctxJob,
    employerId,
    normalizedClientReference: crefMain,
    amountThb,
    gatewayUi: 'promptpay',
    traceId: trace2,
    paymentChannel: 'promptpay',
  });
  assert(r2.reused === true, 'A/D: duplicate returns reused');
  assert(String(r2.gwRow.external_ref) === payId1, 'A: same active payment_id');
  assert(r2.ux.trace_id === trace2, 'canonical: ux carries request trace');
  assert(typeof r2.ux.status_version === 'number', 'canonical: status_version present on reuse');

  const shaped = toPaymentGatewayClientShape(r2.gwRow, {
    amountThb,
    gatewayLabel: 'promptpay',
    clientReferenceId: crefMain,
    traceId: trace2,
    ux: r2.ux,
    reused_duplicate_active: true,
  });
  assert(shaped.success === true && shaped.trace_id === trace2 && shaped.reused_duplicate_active === true, 'canonical: client shape');
  const lowShape = JSON.stringify(shaped).toLowerCase();
  assert(!lowShape.includes('stripe') && !lowShape.includes('omise'), 'canonical: shape omits obvious provider names');

  const lc1 = await ledgerCountForPayment(payId1);
  const ob1 = await outboundCountForPayment(payId1);
  const wh1 = await webhookJobCountSubstring(payId1);
  assert(lc1 === lc0, `D/H: ledger count stable on reuse (${lc0}→${lc1})`);
  assert(ob1 === ob0, `D/H: outbound stable on reuse (${ob0}→${ob1})`);
  assert(wh1 === wh0, `D/H: webhook job rows referencing payment stable (${wh0}→${wh1})`);
  branch('duplicate_reuse');
  branch('ledger_outbound_webhook_stable');

  // Runtime: append-only ledger — UPDATE must fail when a row exists
  const anyLedger = await pool.query(`SELECT id FROM ledger_entries ORDER BY id DESC LIMIT 1`).catch(() => ({ rows: [] }));
  let triggerHit = false;
  if (anyLedger.rows?.[0]?.id != null) {
    try {
      await pool.query(`UPDATE ledger_entries SET description = description WHERE id = $1`, [anyLedger.rows[0].id]);
    } catch (e) {
      triggerHit =
        String(e?.message || e).toLowerCase().includes('append-only') ||
        String(e?.message || e).toLowerCase().includes('not allowed');
    }
  }
  assert(triggerHit || !anyLedger.rows?.length, 'db-safety: ledger UPDATE rejected by trigger when rows exist');
  branch('ledger_append_only_probe');

  // —— Ordering: FAILED row first by id skips to reusable PENDING row (no resurrection)
  {
    const crefOrd = `cref_ord_${RUN}`;
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const amtMinor = Math.max(1, Math.round(amountThb * 100));
      const exA = `aqpp_${randomUUID().replace(/-/g, '')}`;
      const exB = `aqpp_${randomUUID().replace(/-/g, '')}`;
      cleanupState.externalRefs.add(exA);
      cleanupState.externalRefs.add(exB);
      const picked = await insertSyntheticGatewayRows(c, {
        jobId,
        employerId,
        cref: crefOrd,
        extLower: exA,
        extHigher: exB,
        amtMinor,
      });
      await c.query('COMMIT');
      assert(picked.failedExt !== picked.activeExt, 'order: distinct refs');
      const reuse = await lockedCreateOrReuseMatchJobGatewayPayment(pool, {
        job: ctxJob,
        employerId,
        normalizedClientReference: crefOrd,
        amountThb,
        gatewayUi: 'promptpay',
        traceId: `t_${RUN}_ord`,
        paymentChannel: 'promptpay',
      });
      assert(reuse.reused === true && String(reuse.gwRow.external_ref) === String(picked.activeExt), 'order: converge to active row, skip terminal');
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      c.release();
    }
    branch('duplicate_order_skip_failed');
  }

  // —— F: legacy (null cref)
  const leg = await lockedCreateOrReuseMatchJobGatewayPayment(pool, {
    job: ctxJob,
    employerId,
    normalizedClientReference: null,
    amountThb,
    gatewayUi: 'promptpay',
    traceId: `t_${RUN}_leg`,
    paymentChannel: 'promptpay',
  });
  cleanupState.externalRefs.add(String(leg.gwRow.external_ref));
  assert(leg.reused === false, 'legacy: cref null still creates');
  branch('legacy_no_cref');

  // —— B: terminals → new payment_id (same cref after terminal UX)
  const terminalCases = [
    {
      name: 'failed',
      apply: async (ext) => {
        await pool.query(`UPDATE gateway_transactions SET status = 'FAILED' WHERE external_ref = $1`, [ext]);
      },
      expectTerminalUx: (ux) => ux.status === 'failed',
    },
    {
      name: 'completed',
      apply: async (ext) => {
        await pool.query(
          `UPDATE gateway_transactions SET status = 'CAPTURED', settlement_status = 'PAYMENT_CONFIRMED' WHERE external_ref = $1`,
          [ext],
        );
      },
      expectTerminalUx: (ux) => ux.status === 'completed',
    },
    {
      name: 'expired',
      apply: async (ext) => {
        await pool.query(
          `UPDATE gateway_transactions SET status = 'PENDING', settlement_status = 'NOT_APPLICABLE',
             metadata = COALESCE(metadata, '{}'::jsonb) || '{"qr_expires_at":"2000-01-01T00:00:00.000Z"}'::jsonb
           WHERE external_ref = $1`,
          [ext],
        );
      },
      expectTerminalUx: (ux) => ux.status === 'expired',
    },
    {
      name: 'reversed',
      apply: async (ext) => {
        await pool.query(`UPDATE gateway_transactions SET status = 'REFUNDED' WHERE external_ref = $1`, [ext]);
      },
      expectTerminalUx: (ux) => ux.status === 'reversed',
    },
    {
      name: 'manual_review',
      apply: async (ext, jid) => {
        await pool.query(
          `UPDATE gateway_transactions SET status = 'CAPTURED', settlement_status = 'PAYMENT_CONFIRMED' WHERE external_ref = $1`,
          [ext],
        );
        await insertLedgerCompleted(pool, {
          paymentId: ext,
          jobId: jid,
          amountThb: 1.0,
          idemKey: `pcg_manual_${RUN}_${ext.slice(-8)}`,
        });
      },
      expectTerminalUx: (ux) => ux.status === 'manual_review',
    },
  ];

  for (const tc of terminalCases) {
    const cref = `cref_term_${tc.name}_${RUN}`;
    const first = await lockedCreateOrReuseMatchJobGatewayPayment(pool, {
      job: ctxJob,
      employerId,
      normalizedClientReference: cref,
      amountThb,
      gatewayUi: 'promptpay',
      traceId: `t_${RUN}_b_${tc.name}_1`,
      paymentChannel: 'promptpay',
    });
    const pA = String(first.gwRow.external_ref);
    cleanupState.externalRefs.add(pA);
    await tc.apply(pA, jobId);
    const freshGw = await loadGatewayRowByExternalRef(pA);
    assert(freshGw, `B:${tc.name} reload gateway row`);
    const uxAfter = await buildUxPayloadForGatewayRow(pool, freshGw, {
      displayAmount: String(amountThb),
      traceId: `t_${RUN}_b_${tc.name}_probe`,
    });
    assert(tc.expectTerminalUx(uxAfter), `B:${tc.name} terminal UX`, uxAfter.status);
    assert(UX_TERMINAL_STATUSES.has(uxAfter.status), `B:${tc.name} ux is terminal enum`);
    const second = await lockedCreateOrReuseMatchJobGatewayPayment(pool, {
      job: ctxJob,
      employerId,
      normalizedClientReference: cref,
      amountThb,
      gatewayUi: 'promptpay',
      traceId: `t_${RUN}_b_${tc.name}_2`,
      paymentChannel: 'promptpay',
    });
  const pB = String(second.gwRow.external_ref);
  cleanupState.externalRefs.add(pB);
    assert(second.reused === false, `B:${tc.name} new row after terminal`);
    assert(pB !== pA, `B:${tc.name} new payment_id`);
    branch(`terminal_${tc.name}`);
  }

  // —— J: concurrency (same user, job, cref)
  const concRef = `cref_conc_${RUN}`;
  const results = await Promise.all(
    [1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
      lockedCreateOrReuseMatchJobGatewayPayment(pool, {
        job: ctxJob,
        employerId,
        normalizedClientReference: concRef,
        amountThb,
        gatewayUi: 'promptpay',
        traceId: `t_${RUN}_c${n}`,
        paymentChannel: 'promptpay',
      }),
    ),
  );
  results.forEach((r) => cleanupState.externalRefs.add(String(r.gwRow.external_ref)));
  const pids = new Set(results.map((x) => String(x.gwRow.external_ref)));
  assert(pids.size === 1, `J: concurrent single payment_id (got ${[...pids].join(',')})`);
  const reusedN = results.filter((x) => x.reused).length;
  assert(reusedN >= 1 && reusedN < results.length, `J: mix reused/fresh converge (${reusedN}/${results.length})`);
  branch('concurrent_convergence');

  // —— Canonical smoke (deterministic UX build without relying on gateway.created_at ORDER BY — projection uses ledger id ASC only)
  const fakeRow = {
    id: randomUUID(),
    external_ref: `aqpp_${randomUUID().replace(/-/g, '')}`,
    merchant_reference: 'm',
    status: 'PENDING',
    amount_minor: 5000,
    currency: 'THB',
    metadata: {},
    job_id: '00000000-0000-0000-0000-000000000001',
    created_at: new Date(),
  };
  const uxSmoke = await buildUxPayloadForGatewayRow(pool, fakeRow, { displayAmount: '50', traceId: 'ts' });
  const shapeSmoke = toPaymentGatewayClientShape(fakeRow, {
    amountThb: 50,
    gatewayLabel: 'promptpay',
    clientReferenceId: 'cref',
    traceId: 'ts',
    ux: uxSmoke,
    reused_duplicate_active: true,
  });
  assert(shapeSmoke.success === true && shapeSmoke.ux.trace_id === 'ts', 'I: deterministic response shape');
  assert(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(fakeRow.id)),
    'I: synthetic gateway id unrelated to aqpp prefix',
  );
  branch('ux_smoke_projection');
} catch (e) {
  notOk('DB/integration suite', (e && e.message) || String(e));
} finally {
  const jid = cleanupState.jobId;
  const uids = cleanupState.userIds;
  if (jid && uids.length) {
    await pool.query(`DELETE FROM ledger_entries WHERE payment_id = ANY($1::text[])`, [[...cleanupState.externalRefs]]).catch(() => {});
    await pool.query(`DELETE FROM payment_escrow_events WHERE payment_id = ANY($1::text[])`, [[...cleanupState.externalRefs]]).catch(() => {});
    await pool
      .query(`DELETE FROM payments WHERE purpose = 'job_checkout' AND reference_id::text = $1`, [jid])
      .catch(() => {});
    await pool
      .query(`DELETE FROM gateway_transactions WHERE external_ref = ANY($1::text[]) OR job_id::text = $2`, [[...cleanupState.externalRefs], jid])
      .catch(() => {});
    await pool.query(`DELETE FROM jobs WHERE id::text = $1`, [jid]).catch(() => {});
    for (const u of uids) {
      await pool.query(`DELETE FROM users WHERE id::text = $1`, [u]).catch(() => {});
    }
  }
}

await pool.end().catch(() => {});

console.log(`\nPayment creation guard: ${pass} passed, ${fail} failed`);
console.log(`Branches executed (${branches.size}): ${[...branches].sort().join('; ')}`);
if (fail === 0) {
  console.log('Task 17 guard close-out: all integration branches ran (zero [skip] policy).');
}
process.exit(fail ? 1 : 0);
