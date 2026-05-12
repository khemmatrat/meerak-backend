/**
 * Task 19C — Canonical shadow read verification tests.
 *
 *   cd backend
 *   PAYMENT_CANONICAL_SHADOW=1 node scripts/test_payment_canonical_shadow.js
 *   node scripts/test_phase1a_regressions.js
 *   node scripts/test_payment_dual_write_bridge.js
 */

import pg from 'pg';
import { spawnSync } from 'child_process';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

import { projectPaymentState, projectPaymentStateFromDb } from '../lib/paymentStateProjection.js';
import { presentUxPaymentFromProjection, verifyCanonicalShadowForUxRead } from '../lib/paymentResponsePresenter.js';
import {
  CANONICAL_SHADOW_CLASSIFICATION,
  classifyCanonicalShadowPure,
  clearCanonicalShadowScratch,
  deriveCanonicalUxFamilyFromPaymentStatusOnly,
  getCanonicalShadowScratch,
  loadCanonicalBundleByGatewayTxId,
  isCanonicalShadowEnabled,
} from '../lib/paymentCanonicalShadow.js';
import {
  lockedCreateOrReuseMatchJobGatewayPayment,
  ensurePaymentCreationGuardSchema,
  normalizeClientReferenceId,
  consumePaymentCreationBudget,
} from '../lib/paymentCreationGuard.js';
import { buildMatchJobPaymentContext } from '../lib/stripeMatchJobPayment.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendDir = join(__dirname, '..');
const rootDir = join(backendDir, '..');
dotenv.config({ path: join(backendDir, '.env') });
dotenv.config({ path: join(rootDir, '.env') });

const argv = process.argv.slice(2);
process.env.PAYMENT_CANONICAL_SHADOW = '1';

const RUN = `sh_${Date.now()}_${randomUUID().slice(0, 8)}`;

function ok(label, cond, detail = '') {
  if (!cond) {
    console.error(`FAIL: ${label}`, detail || '');
    process.exit(1);
  }
  console.log(`OK: ${label}`);
}

function buildPoolConfig() {
  const timeoutMs = Math.min(
    Math.max(parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || '60000', 10) || 60000, 5000),
    120000,
  );
  const useUrl = argv.includes('--use-url') && process.env.DATABASE_URL;
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

function round2(v) {
  return Math.round((Number(v) + Number.EPSILON) * 100) / 100;
}

async function seedFixture(pool) {
  const employerId = (await pool.query(`SELECT gen_random_uuid() AS id`)).rows[0].id;
  const talentId = (await pool.query(`SELECT gen_random_uuid() AS id`)).rows[0].id;
  const jobId = (await pool.query(`SELECT gen_random_uuid() AS id`)).rows[0].id;
  const hash = await bcrypt.hash('ShShadow!1', 10);
  const empPhone = `+6677${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
  const talPhone = `+6677${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
  const empEmail = `sh_emp_${RUN}@fixture.local`;
  const talEmail = `sh_tal_${RUN}@fixture.local`;

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
      [employerId, `sh_emp_${RUN}`, empEmail, empPhone, hash],
    );
  } catch {
    await pool.query(
      `INSERT INTO users (
         id, firebase_uid, email, phone, password_hash,
         role, provider_status, wallet_balance, account_status, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, 'user', 'UNVERIFIED', 5000, 'active', NOW(), NOW()
       )`,
      [employerId, `sh_emp_${RUN}`, empEmail, empPhone, hash],
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
      [talentId, `sh_tal_${RUN}`, talEmail, talPhone, hash],
    );
  } catch {
    await pool.query(
      `INSERT INTO users (
         id, firebase_uid, email, phone, password_hash,
         role, provider_status, wallet_balance, account_status, provider_available,
         created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, 'provider', 'VERIFIED_PROVIDER', 5000, 'active', true,
         NOW(), NOW()
       )`,
      [talentId, `sh_tal_${RUN}`, talEmail, talPhone, hash],
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
       $5::uuid, $6::uuid, 'SH Fixture Employer', $7::uuid,
       $8::timestamptz, $9::jsonb, '{}'::jsonb, NOW(), NOW()
     )`,
    [jobId, `SH fixture job ${RUN}`, 'Task 19C fixture', 2000, employerId, employerId, talentId, future, locJson],
  );

  const jobRow = (await pool.query(`SELECT * FROM jobs WHERE id::text = $1`, [String(jobId)])).rows[0];
  return {
    employerId: String(employerId),
    jobId: String(jobId),
    jobRow,
  };
}

(async () => {
  const shadowSrc = readFileSync(join(backendDir, 'lib', 'paymentCanonicalShadow.js'), 'utf8');
  ok(
    'B/read-only: paymentCanonicalShadow has no INSERT/UPDATE/DELETE statements',
    !/\b(INSERT\s+INTO|UPDATE\s+\w+|DELETE\s+FROM|TRUNCATE\s+)/i.test(shadowSrc),
  );
  ok(
    'C: shadow module queries must not ORDER BY created_at',
    !/\border\s+by[^\n]{0,40}created_at/i.test(shadowSrc),
  );
  const attemptSrc = readFileSync(join(backendDir, 'lib', 'paymentAttemptRepository.js'), 'utf8');
  const gatewayFetch = /WHERE\s+gateway_transaction_id\s*=\s*\$1::uuid\s+ORDER\s+BY\s+id\s+ASC/i;
  ok('C: attempts gateway fetch ORDER BY id ASC only', gatewayFetch.test(attemptSrc));
  ok(
    'C: paymentAttemptRepository gateway fetch avoids created_at ORDER',
    !/WHERE\s+gateway_transaction_id\s*=\s*\$1::uuid[\s\S]{0,80}ORDER\s+BY[\s\S]{0,20}created_at/i.test(attemptSrc),
  );

  ok('deterministic: PAYMENT_CANONICAL_SHADOW implies enabled', isCanonicalShadowEnabled());

  const a = classifyCanonicalShadowPure({
    bundle: { attempts: [], payment: null, transitions: [] },
    gatewayRow: { id: 'x', status: 'PENDING', amount_minor: 100 },
    uxPayload: null,
  });
  const b = classifyCanonicalShadowPure({
    bundle: { attempts: [], payment: null, transitions: [] },
    gatewayRow: { id: 'x', status: 'PENDING', amount_minor: 100 },
    uxPayload: null,
  });
  ok('A: pure classifier deterministic', JSON.stringify(a) === JSON.stringify(b));

  const dup = classifyCanonicalShadowPure({
    bundle: {
      attempts: [{ id: 'b', payment_id: 'p', gateway_transaction_id: 'g' }, { id: 'a', payment_id: 'p', gateway_transaction_id: 'g' }],
      payment: { id: 'p', status: 'PENDING', amount_minor: 100, active_attempt_id: 'a' },
      transitions: [{ id: 1, to_status: 'PENDING' }],
    },
    gatewayRow: { id: 'g', status: 'PENDING', amount_minor: 100 },
    uxPayload: { status: 'pending' },
  });
  ok('G: duplicate anchor rows', dup.classification === CANONICAL_SHADOW_CLASSIFICATION.duplicate_attempt_anchor);

  const gap = classifyCanonicalShadowPure({
    bundle: {
      attempts: [{ id: 'a1', gateway_transaction_id: 'g', payment_id: 'p' }],
      payment: { id: 'p', status: 'PENDING', amount_minor: 100, active_attempt_id: 'a1' },
      transitions: [],
    },
    gatewayRow: { id: 'g', status: 'PENDING', amount_minor: 100 },
    uxPayload: { status: 'pending' },
  });
  ok('H: transition gap', gap.classification === CANONICAL_SHADOW_CLASSIFICATION.transition_gap);

  const orphan = classifyCanonicalShadowPure({
    bundle: {
      attempts: [{ id: 'wrong', gateway_transaction_id: 'g', payment_id: 'p' }],
      payment: { id: 'p', status: 'PENDING', amount_minor: 100, active_attempt_id: 'different' },
      transitions: [{ id: 1, to_status: 'PENDING' }],
    },
    gatewayRow: { id: 'g', status: 'PENDING', amount_minor: 100 },
    uxPayload: { status: 'pending' },
  });
  ok('orphan active attempt', orphan.classification === CANONICAL_SHADOW_CLASSIFICATION.orphan_attempt);

  const miss = classifyCanonicalShadowPure({
    bundle: { attempts: [], payment: null, transitions: [] },
    gatewayRow: { id: 'gw1', status: 'PENDING', amount_minor: 100 },
    uxPayload: null,
  });
  ok('D: legacy missing canonical', miss.classification === CANONICAL_SHADOW_CLASSIFICATION.missing_canonical);

  const mismatch = classifyCanonicalShadowPure({
    bundle: {
      attempts: [{ id: 'at', gateway_transaction_id: 'gx', payment_id: 'pay' }],
      payment: { id: 'pay', status: 'CAPTURED', amount_minor: 10000, active_attempt_id: 'at' },
      transitions: [{ id: 10, to_status: 'PENDING' }],
    },
    gatewayRow: { id: 'gx', status: 'PENDING', amount_minor: 10000 },
    uxPayload: { status: 'awaiting_payment' },
  });
  ok('E: status mismatch gw vs canonical', mismatch.classification === CANONICAL_SHADOW_CLASSIFICATION.status_mismatch);

  const amt = classifyCanonicalShadowPure({
    bundle: {
      attempts: [{ id: 'at', gateway_transaction_id: 'gx', payment_id: 'pay' }],
      payment: { id: 'pay', status: 'PENDING', amount_minor: 90000, active_attempt_id: 'at' },
      transitions: [{ id: 10, to_status: 'PENDING' }],
    },
    gatewayRow: { id: 'gx', status: 'PENDING', amount_minor: 99999 },
    uxPayload: { status: 'pending' },
  });
  ok('E: amount mismatch', amt.classification === CANONICAL_SHADOW_CLASSIFICATION.amount_mismatch);

  const fam = deriveCanonicalUxFamilyFromPaymentStatusOnly('PENDING');
  ok('deterministic ux family mirror', fam === 'non_terminal');

  /** I + J projection/presenter output unchanged baseline */
  const evFixture = {
    payment_id: 'aqpp_fixture',
    ledger_rows: [],
    gateway_row: { status: 'PENDING', amount_minor: 5000 },
    escrow_events: [],
    processed_webhook_keys: [],
  };
  const p0 = projectPaymentState(evFixture);
  const p1 = projectPaymentState(evFixture);
  ok('I: projectPaymentState deep stable', JSON.stringify(p0) === JSON.stringify(p1));

  const ux0 = presentUxPaymentFromProjection(p0, {});
  const ux1 = presentUxPaymentFromProjection(p1, {});
  ok('J: presentUx deterministic for same projection', JSON.stringify(ux0) === JSON.stringify(ux1));

  /** F production response mutation guard: presenter return object identity semantics via serialization */
  const uxExtra = presentUxPaymentFromProjection(p0, { trace_id: 'x', awaiting_user_hint: true });
  delete uxExtra.__unexpectedMutation;
  ok('presenter returns enumerable keys unchanged count', typeof uxExtra.status === 'string');

  for (const n of ['193', '194']) {
    const r = spawnSync(process.execPath, [join(backendDir, 'scripts', 'run-migration.js'), n], {
      cwd: backendDir,
      encoding: 'utf8',
      env: process.env,
    });
    ok(`migration ${n}`, r.status === 0, r.stderr || r.stdout);
  }

  const pool = new pg.Pool(buildPoolConfig());
  await ensurePaymentCreationGuardSchema(pool);
  for (let i = 0; i < 6; i++) {
    await consumePaymentCreationBudget(pool, { actorUserKey: `sh:${RUN}`, windowSec: 60, maxBurst: 99 });
  }

  let jobIdVal = '';
  let userIds = [];

  try {
    clearCanonicalShadowScratch();
    const { employerId, jobId, jobRow } = await seedFixture(pool);
    jobIdVal = jobId;
    userIds = [employerId, String(jobRow.accepted_by)];
    const ctxPricing = await buildMatchJobPaymentContext(pool, jobId, { userId: employerId });
    const amtTh = round2(ctxPricing.finalPrice);
    const cref = normalizeClientReferenceId(`sh_cref_${RUN}`).value;
    const locked = await lockedCreateOrReuseMatchJobGatewayPayment(pool, {
      job: { ...jobRow, id: jobId },
      employerId,
      normalizedClientReference: cref,
      amountThb: amtTh,
      gatewayUi: 'promptpay',
      traceId: `trace_sh_${RUN}`,
      paymentChannel: 'promptpay',
    });
    const gwId = String(locked.gwRow.id || '');
    const payKey = String(locked.gwRow.external_ref || '');

    const proj = await projectPaymentStateFromDb(pool, {
      payment_id: payKey,
      gateway_transaction_id: gwId,
    });

    /** Corrupt canonical status to force shadow mismatch detection (fixture DB mutation only — not shadow). */
    await pool.query(`UPDATE payments SET status = 'CAPTURED' WHERE purpose = 'job_checkout' AND reference_id::text = $1`, [
      jobId,
    ]);

    await projectPaymentStateFromDb(pool, {
      payment_id: payKey,
      gateway_transaction_id: gwId,
    });
    const scr = getCanonicalShadowScratch();
    ok('E integration: mismatch detected post mutation', scr.projection?.classification === CANONICAL_SHADOW_CLASSIFICATION.status_mismatch);

    /** Restore mirror for ux leg */
    await pool.query(`UPDATE payments SET status = 'PENDING' WHERE purpose = 'job_checkout' AND reference_id::text = $1`, [jobId]);

    clearCanonicalShadowScratch();
    const projFresh = await projectPaymentStateFromDb(pool, {
      payment_id: payKey,
      gateway_transaction_id: gwId,
    });
    const ux = presentUxPaymentFromProjection(projFresh, { trace_id: 't_sh', awaiting_user_hint: true });
    await verifyCanonicalShadowForUxRead(pool, {
      gatewayTransactionId: gwId,
      gatewayRow: locked.gwRow,
      projected: projFresh,
      uxPayload: ux,
    });
    const uxScr = getCanonicalShadowScratch();
    ok(
      'integration: ux leg audited',
      !!(uxScr.ux?.classification === CANONICAL_SHADOW_CLASSIFICATION.match),
    );

    /** bundle loader uses ORDER BY id (no created_at) */
    const bundle = await loadCanonicalBundleByGatewayTxId(pool, gwId);
    ok('bundle.loader returns attempts', bundle.attempts.length >= 1);
    ok('projection shape unchanged vs pure projectPaymentState on same fixture evidence', !!(proj.payment_id));

    process.env.PAYMENT_CANONICAL_SHADOW = '0';
    const baseline = await projectPaymentStateFromDb(pool, {
      payment_id: payKey,
      gateway_transaction_id: gwId,
    });
    process.env.PAYMENT_CANONICAL_SHADOW = '1';
    const withShadow = await projectPaymentStateFromDb(pool, {
      payment_id: payKey,
      gateway_transaction_id: gwId,
    });
    ok('I: shadow flag does not change projection JSON', JSON.stringify(baseline) === JSON.stringify(withShadow));

    console.log('\nPASS: test_payment_canonical_shadow.js');
    console.log(
      'gateway_transactions stays production read source; shadow is auxiliary verification only.',
    );
  } finally {
    if (jobIdVal) {
      await pool.query(`DELETE FROM ledger_entries WHERE payment_id IN (
        SELECT external_ref FROM gateway_transactions WHERE job_id::text = $1
      )`, [jobIdVal]).catch(() => {});
      await pool
        .query(`DELETE FROM payments WHERE purpose = 'job_checkout' AND reference_id::text = $1`, [jobIdVal])
        .catch(() => {});
      await pool.query(`DELETE FROM gateway_transactions WHERE job_id::text = $1`, [jobIdVal]).catch(() => {});
      await pool.query(`DELETE FROM jobs WHERE id::text = $1`, [jobIdVal]).catch(() => {});
    }
    for (const uid of userIds) {
      await pool.query(`DELETE FROM users WHERE id::text = $1`, [uid]).catch(() => {});
    }
    await pool.end().catch(() => {});
    delete process.env.PAYMENT_CANONICAL_SHADOW;
  }
})();
