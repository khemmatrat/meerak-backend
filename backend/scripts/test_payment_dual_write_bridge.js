/**
 * Task 19B — Canonical payment dual-write bridge (same transaction as gateway create/reuse).
 *
 *   cd backend && node scripts/test_payment_dual_write_bridge.js
 *   cd backend && node scripts/test_phase1a_regressions.js
 */

import pg from 'pg';
import { spawnSync } from 'child_process';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

import { buildMatchJobPaymentContext } from '../lib/stripeMatchJobPayment.js';
import {
  lockedCreateOrReuseMatchJobGatewayPayment,
  ensurePaymentCreationGuardSchema,
  normalizeClientReferenceId,
  consumePaymentCreationBudget,
} from '../lib/paymentCreationGuard.js';
import { GATEWAY_TX_STATUS } from '../internal-gateway/constants.js';
import { findCanonicalPaymentIdByGatewayTxId } from '../lib/paymentIntentRepository.js';
import { countTransitionsForPayment } from '../lib/paymentTransitionRepository.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendDir = join(__dirname, '..');
const rootDir = join(backendDir, '..');
dotenv.config({ path: join(backendDir, '.env') });
dotenv.config({ path: join(rootDir, '.env') });

const argv = process.argv.slice(2);

const RUN = `dw_${Date.now()}_${randomUUID().slice(0, 8)}`;

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

function ok(label, cond, detail = '') {
  if (!cond) {
    console.error(`FAIL: ${label}`, detail || '');
    process.exit(1);
  }
  console.log(`OK: ${label}`);
}

function round2(v) {
  return Math.round((Number(v) + Number.EPSILON) * 100) / 100;
}

async function seedFixture(pool) {
  const employerId = (await pool.query(`SELECT gen_random_uuid() AS id`)).rows[0].id;
  const talentId = (await pool.query(`SELECT gen_random_uuid() AS id`)).rows[0].id;
  const jobId = (await pool.query(`SELECT gen_random_uuid() AS id`)).rows[0].id;
  const hash = await bcrypt.hash('DwBridge!9', 10);
  const empPhone = `+6689${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
  const talPhone = `+6689${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
  const empEmail = `dw_emp_${RUN}@fixture.local`;
  const talEmail = `dw_tal_${RUN}@fixture.local`;

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
      [employerId, `dw_emp_${RUN}`, empEmail, empPhone, hash],
    );
  } catch {
    await pool.query(
      `INSERT INTO users (
         id, firebase_uid, email, phone, password_hash,
         role, provider_status, wallet_balance, account_status, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, 'user', 'UNVERIFIED', 5000, 'active', NOW(), NOW()
       )`,
      [employerId, `dw_emp_${RUN}`, empEmail, empPhone, hash],
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
      [talentId, `dw_tal_${RUN}`, talEmail, talPhone, hash],
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
      [talentId, `dw_tal_${RUN}`, talEmail, talPhone, hash],
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
       $5::uuid, $6::uuid, 'DW Fixture Employer', $7::uuid,
       $8::timestamptz, $9::jsonb, '{}'::jsonb, NOW(), NOW()
     )`,
    [jobId, `DW fixture job ${RUN}`, 'Task 19B fixture', 2000, employerId, employerId, talentId, future, locJson],
  );

  const jobRow = (await pool.query(`SELECT * FROM jobs WHERE id::text = $1`, [String(jobId)])).rows[0];
  return {
    employerId: String(employerId),
    jobId: String(jobId),
    jobRow,
  };
}

(async () => {
  for (const n of ['193', '194']) {
    const r = spawnSync(process.execPath, [join(backendDir, 'scripts', 'run-migration.js'), n], {
      cwd: backendDir,
      encoding: 'utf8',
      env: process.env,
    });
    ok(`migration ${n} applies`, r.status === 0, r.stderr || r.stdout);
  }

  const src = readFileSync(join(backendDir, 'lib', 'paymentIntentRepository.js'), 'utf8');
  const i0 = src.indexOf('findCanonicalPaymentIdByGatewayTxId');
  ok('source proof: findCanonical anchor exists', i0 >= 0);
  const chunk = src.slice(i0, i0 + 800);
  ok('source proof: ORDER BY payments.id ASC in anchor resolver', /\bORDER BY p\.id ASC\b/i.test(chunk));
  ok('source proof: no created_at ORDER in anchor resolver', !/\border\s+by\s+[^\n]*created_at/i.test(chunk));

  const pool = new pg.Pool(buildPoolConfig());

  await ensurePaymentCreationGuardSchema(pool);
  const actorKey = `dw:${RUN}`;
  for (let i = 0; i < 8; i++) {
    await consumePaymentCreationBudget(pool, { actorUserKey: actorKey, windowSec: 60, maxBurst: 99 });
  }

  let jobIdVal = '';
  let userIdsVal = [];

  try {
    const { employerId, jobId, jobRow } = await seedFixture(pool);
    jobIdVal = jobId;
    userIdsVal = [employerId, String(jobRow.accepted_by)];
    const ctxPricing = await buildMatchJobPaymentContext(pool, jobId, { userId: employerId });
    const amountThb = round2(ctxPricing.finalPrice);
    ok('fixture priced', amountThb >= 15, String(amountThb));
    const ctxJob = { ...jobRow, id: jobId };

    const crefDup = normalizeClientReferenceId(`dw_dup_${RUN}`).value;

    const r1 = await lockedCreateOrReuseMatchJobGatewayPayment(pool, {
      job: ctxJob,
      employerId,
      normalizedClientReference: crefDup,
      amountThb,
      gatewayUi: 'promptpay',
      traceId: `dw_t1_${RUN}`,
      paymentChannel: 'promptpay',
    });

    ok('A/D: locked create succeeds', !!(r1 && r1.gwRow && !r1.reused));
    const gwId = String(r1.gwRow.id || '');
    const extRef = String(r1.gwRow.external_ref || '');

    const payId = await findCanonicalPaymentIdByGatewayTxId(pool, gwId);
    ok('A/D: canonical payment anchor exists', !!payId);
    ok('D: mirrored status equals gateway verbatim', String(r1.gwRow.status) === String(GATEWAY_TX_STATUS.PENDING));
    const prow = (
      await pool.query(`SELECT id, status, amount_minor FROM payments WHERE id::text = $1`, [payId])
    ).rows?.[0];
    ok('D/E: canonical payments.status mirrors gateway column', prow?.status === r1.gwRow.status);

    const rowsAtt = (
      await pool.query(
        `SELECT id, gateway_transaction_id, status FROM payment_attempts WHERE payment_id::text = $1 ORDER BY id ASC`,
        [payId],
      )
    ).rows;
    ok('D: anchored attempt rows exist', rowsAtt.length >= 1);

    const att = rowsAtt[0];
    ok(
      'D: attempt.gateway_transaction_id = gateway_transactions.id',
      String(att.gateway_transaction_id) === gwId,
    );

    ok('D: attempt status mirrors gateway verbatim', String(att.status) === String(r1.gwRow.status));

    ok('E/I: transition count deterministic', (await countTransitionsForPayment(pool, payId)) === 1);

    const r2 = await lockedCreateOrReuseMatchJobGatewayPayment(pool, {
      job: ctxJob,
      employerId,
      normalizedClientReference: crefDup,
      amountThb,
      gatewayUi: 'promptpay',
      traceId: `dw_t2_${RUN}`,
      paymentChannel: 'promptpay',
    });
    ok('C: reuse path hits same aqpp external ref', String(r2.gwRow.external_ref) === extRef);
    const dupPayCount = (
      await pool.query(
        `
        SELECT COUNT(DISTINCT pa.payment_id)::int AS c
        FROM gateway_transactions g
        JOIN payment_attempts pa ON pa.gateway_transaction_id = g.id::uuid
        WHERE g.external_ref = $1
      `,
        [extRef],
      )
    ).rows?.[0]?.c;
    ok('C: exactly one canonical payment per gateway txn', dupPayCount === 1);

    ok(
      'E: still one transition after reuse (no duplicate initial)',
      (await countTransitionsForPayment(pool, payId)) === 1,
    );

    let updBlocked = false;
    try {
      await pool.query(`UPDATE payment_status_transitions SET trace_id = trace_id WHERE payment_id = $1::uuid`, [
        payId,
      ]);
    } catch (e) {
      updBlocked = /append-only|payment_status_transitions/i.test(String(e.message || e));
    }
    ok('F: transitions append-only (UPDATE rejected)', updBlocked);

    const leg = await lockedCreateOrReuseMatchJobGatewayPayment(pool, {
      job: ctxJob,
      employerId,
      normalizedClientReference: null,
      amountThb,
      gatewayUi: 'promptpay',
      traceId: `dw_leg_${RUN}`,
      paymentChannel: 'promptpay',
    });
    ok('G: legacy null cref succeeds', !!(leg?.gwRow && !leg?.reused));
    const gwLeg = String(leg.gwRow.id || '');
    const payLegId = await findCanonicalPaymentIdByGatewayTxId(pool, gwLeg);
    ok('G: legacy canonical anchor exists', !!payLegId);
    ok('G: one initial transition legacy', (await countTransitionsForPayment(pool, payLegId)) === 1);

    const concRef = normalizeClientReferenceId(`dw_conc_${RUN}`).value;
    const concResults = await Promise.all(
      [1, 2, 3, 4, 5, 6].map((n) =>
        lockedCreateOrReuseMatchJobGatewayPayment(pool, {
          job: ctxJob,
          employerId,
          normalizedClientReference: concRef,
          amountThb,
          gatewayUi: 'promptpay',
          traceId: `dw_c${n}_${RUN}`,
          paymentChannel: 'promptpay',
        }),
      ),
    );
    const pids = new Set(concResults.map((x) => String(x.gwRow.external_ref)));
    ok('H: concurrent converge single gateway external_ref', pids.size === 1);
    const gExt = [...pids][0];
    const concPayAnchors = (
      await pool.query(
        `
        SELECT COUNT(DISTINCT pa.payment_id)::int AS c
        FROM payment_attempts pa
        JOIN gateway_transactions gt ON gt.id = pa.gateway_transaction_id
        WHERE gt.external_ref = $1
      `,
        [gExt],
      )
    ).rows[0]?.c;
    ok('H: concurrent single canonical anchor', concPayAnchors === 1);

    const badExt = `aqpp_bad_${randomUUID().replace(/-/g, '')}`;
    const amtMinor = Math.max(2, Math.round(amountThb * 100));
    const c = await pool.connect();
    let sawCheck = false;
    try {
      await c.query('BEGIN');
      await c.query(
        `INSERT INTO gateway_transactions (
           external_ref, merchant_reference, amount_minor, currency, status, metadata, job_id, release_rules, fraud_flags
         ) VALUES (
           $1, $2, $3, 'THB', $4, '{}'::jsonb, $5, '{}'::jsonb, '{}'::jsonb
         )`,
        [badExt, jobIdVal, amtMinor, GATEWAY_TX_STATUS.PENDING, jobIdVal],
      );
      try {
        await c.query(
          `INSERT INTO payments (
             user_id, purpose, currency, amount_minor, status, metadata
           ) VALUES ($1::uuid, 'job_checkout', 'THB', $2::bigint, $3, '{}'::jsonb)`,
          [employerId, amtMinor, '__INVALID_STATUS_FOR_ATOMIC_ROLLBACK_TEST__'],
        );
      } catch (e) {
        sawCheck = e && (e.code === '23514' || /check constraint|violates check/i.test(String(e.message || e)));
      }
      await c.query('ROLLBACK');
    } finally {
      c.release();
    }
    ok('B: invalid canonical row triggers constraint (check expected)', sawCheck);
    const ghost = await pool.query(`SELECT 1 FROM gateway_transactions WHERE external_ref = $1 LIMIT 1`, [badExt]);
    ok('B: rollback leaves no orphan gateway row', ghost.rows.length === 0);

    console.log('\nPASS: test_payment_dual_write_bridge.js');
    console.log(
      'Statement: gateway_transactions remains the production read source for projection/presenter/reconciliation during Phase 1B dual-write.',
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
    for (const uid of userIdsVal) {
      await pool.query(`DELETE FROM users WHERE id::text = $1`, [uid]).catch(() => {});
    }
    await pool.end().catch(() => {});
  }
})();
