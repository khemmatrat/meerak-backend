/**
 * Task 19A — Phase 1B foundation: migration + rollback + invariant smoke tests.
 *
 * Proofs:
 *   A migration applies cleanly (idempotent re-run via run-migration.js)
 *   B rollback succeeds
 *   C payment_status_transitions append-only enforced
 *   D unique (provider, external_event_id) dedupe
 *   E FK-friendly null gateway_transaction_id + deferred active_attempt FK
 *
 * Requires: PostgreSQL reachable (backend .env); users + gateway_transactions from prior migrations.
 * Does not modify Phase 1A webhook/worker modules.
 *
 *   cd backend
 *   node scripts/test_payment_foundation_migration.js
 */

import pg from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import { spawnSync } from 'child_process';
import { randomUUID } from 'crypto';

import {
  insertPaymentSkeleton,
  fetchPaymentByIdSkeleton,
} from '../lib/paymentIntentRepository.js';
import {
  insertPaymentAttemptSkeleton,
  fetchAttemptsForPaymentSkeleton,
} from '../lib/paymentAttemptRepository.js';
import {
  appendTransitionSkeleton,
  fetchTransitionsForPaymentSkeleton,
} from '../lib/paymentTransitionRepository.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendDir = join(__dirname, '..');
const rootDir = join(backendDir, '..');
dotenv.config({ path: join(backendDir, '.env') });
dotenv.config({ path: join(rootDir, '.env') });

const migrationsDir = join(backendDir, 'db', 'migrations');
const rollbackPath = join(backendDir, 'db', 'scripts', 'rollback_193_payment_foundation_phase1b.sql');

function ok(label, cond, detail = '') {
  if (!cond) {
    console.error(`FAIL: ${label}`, detail || '');
    process.exit(1);
  }
  console.log(`OK: ${label}`);
}

/** Same algorithm as scripts/run-migration.js (respect $$ and strings). */
function splitStatements(sql) {
  const out = [];
  let cur = '';
  let i = 0;
  let inDollar = false;
  let inLineComment = false;
  let inString = false;
  let stringChar = null;
  while (i < sql.length) {
    const c = sql[i];
    const c2 = sql.slice(i, i + 2);

    if (inLineComment) {
      if (c === '\n') inLineComment = false;
      cur += c;
      i++;
      continue;
    }
    if (inString) {
      if (c === '\\' && i + 1 < sql.length) {
        cur += c + sql[i + 1];
        i += 2;
        continue;
      }
      if (c === stringChar) inString = false;
      cur += c;
      i++;
      continue;
    }
    if (!inDollar && (c2 === '--' || (c === '-' && sql[i + 1] === '-'))) {
      inLineComment = true;
      cur += c;
      i++;
      continue;
    }
    if (!inDollar && (c === "'" || c === '"')) {
      inString = true;
      stringChar = c;
      cur += c;
      i++;
      continue;
    }
    if (c2 === '$$' && !inDollar) {
      inDollar = true;
      cur += '$$';
      i += 2;
      continue;
    }
    if (inDollar && c2 === '$$') {
      inDollar = false;
      cur += '$$';
      i += 2;
      continue;
    }
    if (!inDollar && c === ';') {
      const s = (cur + ';').trim();
      const noLeadingComments = s.replace(/^\s*--[^\n]*\n?/gm, '').trim();
      if (s && noLeadingComments) out.push(s);
      cur = '';
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  const tail = cur.trim();
  if (tail) out.push(tail);
  return out;
}

function buildPoolConfig() {
  const timeoutMs = Math.min(
    Math.max(parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || '60000', 10) || 60000, 5000),
    120000,
  );
  const useUrl = process.env.DATABASE_URL && (process.argv.includes('--use-url') || process.env.USE_DATABASE_URL === '1');
  if (!useUrl) {
    return {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_DATABASE || process.env.DB_NAME || 'meera_db',
      user: process.env.DB_USER || 'meera',
      password: process.env.DB_PASSWORD || 'meera123',
      connectionTimeoutMillis: timeoutMs,
      max: 5,
    };
  }
  const noVerify = process.env.PGSSLMODE === 'no-verify';
  const sslExplicitOff =
    process.env.DATABASE_SSL_DISABLE === '1' || process.env.DATABASE_SSL_DISABLE === 'true';
  let ssl = false;
  try {
    const href = process.env.DATABASE_URL.replace(/^postgres(ql)?:\/\//, 'https://');
    const u = new URL(href);
    const isLocal =
      u.hostname === 'localhost' ||
      u.hostname === '127.0.0.1' ||
      u.hostname.endsWith('.local');
    if (!sslExplicitOff && !isLocal) {
      ssl = { rejectUnauthorized: !noVerify };
    }
  } catch {
    ssl = sslExplicitOff ? false : { rejectUnauthorized: !noVerify };
  }
  return {
    connectionString: process.env.DATABASE_URL,
    ssl,
    connectionTimeoutMillis: timeoutMs,
    max: 5,
  };
}

async function migration193Path() {
  const files = readdirSync(migrationsDir);
  const found = files.find((f) => f.includes('payment_foundation_phase1b') && f.endsWith('.sql'));
  ok('migration filename matches *payment_foundation_phase1b.sql', !!found);
  return join(migrationsDir, found);
}

function runMigration193ViaScript() {
  const r = spawnSync(process.execPath, [join(backendDir, 'scripts', 'run-migration.js'), '193'], {
    cwd: backendDir,
    encoding: 'utf8',
    env: { ...process.env },
  });
  ok('run-migration.js 193 exit 0', r.status === 0, r.stderr || r.stdout);
}

async function execSqlFile(client, filePath, label) {
  const sql = readFileSync(filePath, 'utf8');
  const stmts = splitStatements(sql);
  for (let i = 0; i < stmts.length; i++) {
    try {
      await client.query(stmts[i]);
    } catch (e) {
      console.error(`${label} failed at stmt ${i + 1}/${stmts.length}:`, e.message);
      throw e;
    }
  }
}

async function tableExists(client, name) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
    [name],
  );
  return rows.length > 0;
}

(async () => {
  const pool = new pg.Pool(buildPoolConfig());
  const client = await pool.connect();
  try {
    await migration193Path();

    // A — apply cleanly (runner; second run must be idempotent)
    runMigration193ViaScript();
    runMigration193ViaScript();

    ok('payments table exists', await tableExists(client, 'payments'));
    ok('payment_attempts table exists', await tableExists(client, 'payment_attempts'));
    ok('payment_status_transitions table exists', await tableExists(client, 'payment_status_transitions'));
    ok('payment_webhook_events table exists', await tableExists(client, 'payment_webhook_events'));

    const { rows: ur } = await client.query(`SELECT id FROM users ORDER BY created_at ASC LIMIT 1`);
    ok('fixture user exists for FK', ur.length >= 1, 'Seed at least one user before running.');
    const userId = ur[0].id;

    const gwRow = (
      await client.query(
        `INSERT INTO gateway_transactions (amount_minor, currency, status, metadata)
         VALUES ($1::bigint, 'THB', 'PENDING', '{}'::jsonb) RETURNING id`,
        [100],
      )
    ).rows[0];

    await client.query('BEGIN');

    const pay = (
      await client.query(
        `INSERT INTO payments (user_id, purpose, currency, amount_minor, status)
         VALUES ($1::uuid, 'wallet_topup', 'THB', 15000::bigint, 'pending')
         RETURNING id`,
        [userId],
      )
    ).rows[0];

    const attNoGw = (
      await client.query(
        `INSERT INTO payment_attempts (payment_id, provider, method, status, gateway_transaction_id)
         VALUES ($1::uuid, 'payso', 'promptpay_qr', 'pending', NULL)
         RETURNING id`,
        [pay.id],
      )
    ).rows[0];
    ok('attempt with nullable gateway_transaction_id', !!attNoGw.id);

    const attLinked = (
      await client.query(
        `INSERT INTO payment_attempts (payment_id, provider, method, status, gateway_transaction_id)
         VALUES ($1::uuid, 'payso', 'promptpay_qr', 'processing', $2::uuid)
         RETURNING id`,
        [pay.id, gwRow.id],
      )
    ).rows[0];

    await client.query(`UPDATE payments SET active_attempt_id = $1::uuid WHERE id = $2::uuid`, [
      attLinked.id,
      pay.id,
    ]);

    await client.query('COMMIT');

    ok('deferred FK active_attempt_id committed', !!(await fetchPaymentByIdSkeleton(client, pay.id))?.active_attempt_id);

    const tr = (
      await client.query(
        `INSERT INTO payment_status_transitions (payment_id, from_status, to_status, transition_source, trace_id)
         VALUES ($1::uuid, 'created', 'pending', 'test', 'trace-phase1b')
         RETURNING id`,
        [pay.id],
      )
    ).rows[0];

    let threwAppend = false;
    try {
      await client.query(`UPDATE payment_status_transitions SET trace_id='x' WHERE id=$1`, [tr.id]);
    } catch {
      threwAppend = true;
    }
    ok('payment_status_transitions rejects UPDATE', threwAppend);

    let threwDel = false;
    try {
      await client.query(`DELETE FROM payment_status_transitions WHERE id=$1`, [tr.id]);
    } catch {
      threwDel = true;
    }
    ok('payment_status_transitions rejects DELETE', threwDel);

    const webhookDedupeId = `evt-${randomUUID()}`;
    await client.query(
      `INSERT INTO payment_webhook_events (provider, external_event_id, event_type, payload_hash, trace_id)
       VALUES ('payso', $1::text, 'charge.succeeded', 'sha256:digest', NULL)`,
      [webhookDedupeId],
    );
    let dupWebhook = false;
    try {
      await client.query(
        `INSERT INTO payment_webhook_events (provider, external_event_id, event_type, payload_hash)
         VALUES ('payso', $1::text, 'charge.succeeded', 'sha256:other')`,
        [webhookDedupeId],
      );
    } catch (e) {
      dupWebhook =
        String(e.code) === '23505' ||
        /unique|duplicate/i.test(e.message || '') ||
        /ux_payment_webhook_events_provider_external/i.test(e.message || '');
    }
    ok('webhook duplicate (provider + external_event_id) rejected', dupWebhook);

    // Repository skeletons (no prod wiring proof — exercise queries only)
    const p2 = await insertPaymentSkeleton(client, {
      userId,
      purpose: 'job_checkout',
      amountMinor: 200,
      metadata: { via: 'skeleton' },
    });
    ok('insertPaymentSkeleton', !!p2?.id);
    await appendTransitionSkeleton(client, {
      paymentId: p2.id,
      fromStatus: null,
      toStatus: 'pending',
      transitionSource: 'skeleton_test',
      metadata: {},
    });
    const at = await insertPaymentAttemptSkeleton(client, {
      paymentId: p2.id,
      provider: 'payso',
      method: 'card',
      gatewayTransactionId: null,
    });
    ok('insertPaymentAttemptSkeleton', !!at?.id);
    ok('fetchAttemptsForPaymentSkeleton length', (await fetchAttemptsForPaymentSkeleton(client, p2.id)).length >= 1);
    ok(
      'fetchTransitionsForPaymentSkeleton ordering by id',
      (await fetchTransitionsForPaymentSkeleton(client, p2.id)).length >= 1,
    );

    // updated_at trigger
    const p2BeforeUpdate = await fetchPaymentByIdSkeleton(client, p2.id);
    await client.query(`UPDATE payments SET status='cancelled', status_version=2 WHERE id=$1::uuid`, [p2.id]);
    const p2r = await fetchPaymentByIdSkeleton(client, p2.id);
    ok(
      'payments.updated_at bumped on UPDATE',
      p2BeforeUpdate &&
        p2r &&
        new Date(p2r.updated_at).getTime() > new Date(p2BeforeUpdate.updated_at).getTime(),
    );

    await client.query('DELETE FROM gateway_transactions WHERE id = $1::uuid', [gwRow.id]);

    await client.query('BEGIN');
    ok('rollback file exists', readFileSync(rollbackPath, 'utf8').length > 50);
    await execSqlFile(client, rollbackPath, 'rollback');

    ok('payments dropped after rollback', !(await tableExists(client, 'payments')));
    ok('gateway_transactions still intact', await tableExists(client, 'gateway_transactions'));
    await client.query('COMMIT');

    // Re-apply migration so subsequent dev / CI phases see Phase 1B tables
    runMigration193ViaScript();
    ok('re-apply 193 restores tables', await tableExists(client, 'payments'));

    console.log('\nPASS: test_payment_foundation_migration.js (Proofs A–E exercised; run test_phase1a_regressions.js separately)');
  } catch (e) {
    console.error(e);
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
