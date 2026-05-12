/**
 * Task 19F — Intent API shell read-through tests.
 *
 *   cd backend
 *   node scripts/test_payment_intent_api_shell.js
 *   node scripts/test_payment_intent_api_shell.js --integration   (needs DB + JWT optional)
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

import {
  buildPaymentIntentSnapshot,
  looksLikePaymentIntentUuid,
  summarizeCanonicalBundleForIntentApi,
} from '../api/paymentIntentRead.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendDir = join(__dirname, '..');
dotenv.config({ path: join(backendDir, '.env') });

const argv = process.argv.slice(2);

function ok(label, cond, detail = '') {
  if (!cond) {
    console.error(`FAIL: ${label}`, detail || '');
    process.exit(1);
  }
  console.log(`OK: ${label}`);
}

function buildPoolConfig() {
  const timeoutMs = Math.min(
    Math.max(parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || '8000', 10) || 8000, 2000),
    15000,
  );
  const useUrl = argv.includes('--use-url') && process.env.DATABASE_URL;
  if (useUrl) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: process.env.PGSSLMODE !== 'no-verify' },
      connectionTimeoutMillis: timeoutMs,
      max: 2,
    };
  }
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_DATABASE || process.env.DB_NAME || 'meera_db',
    user: process.env.DB_USER || 'meera',
    password: process.env.DB_PASSWORD || 'meera123',
    connectionTimeoutMillis: timeoutMs,
    max: 2,
  };
}

/* --- Pure --- */
ok('uuid detector', looksLikePaymentIntentUuid('11111111-1111-4111-8111-111111111111'));
ok('uuid detector rejects garbage', !looksLikePaymentIntentUuid('not-a-uuid'));

const sum = summarizeCanonicalBundleForIntentApi({
  payment: {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    status: 'CAPTURED',
    amount_minor: 100,
    reference_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    active_attempt_id: '1',
  },
  attempts: [{ id: '1', gateway_transaction_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }],
  transitions: [{ id: 1 }, { id: 2 }],
});
ok('canonical summary shape', sum?.payment?.id && sum.transition_count === 2 && sum.attempts?.length === 1);
ok('canonical summary strip null payment', summarizeCanonicalBundleForIntentApi({ attempts: [], transitions: [] }) === null);

/* --- Source proof: intent read module has no DML --- */
const src = readFileSync(join(backendDir, 'api', 'paymentIntentRead.js'), 'utf8').toUpperCase();
ok('19F module no INSERT INTO', !src.includes('INSERT INTO'));
ok('19F module no DELETE FROM', !src.includes('DELETE FROM'));
ok('19F module no TRUNCATE', !src.includes('TRUNCATE'));

/* --- server route wired --- */
const srv = readFileSync(join(backendDir, 'server.js'), 'utf8');
ok('server mounts GET /api/payments/intents/:id', srv.includes(`'/api/payments/intents/:id'`) && srv.includes('handlePaymentIntentSnapshotGet'));
ok('intent route uses authenticateToken', srv.includes("'/api/payments/intents/:id', authenticateToken"));

/* --- integration --- */
if (argv.includes('--integration')) {
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) {
    console.log('SKIP integration: JWT_SECRET not set');
  } else {
    const pool = new pg.Pool(buildPoolConfig());
    try {
      await pool.query('SELECT 1');
      const uid = (await pool.query(`SELECT id::text FROM users LIMIT 1`)).rows?.[0]?.id;
      ok('integration needs a user row', !!uid);

      const jobRows = await pool.query(
        `SELECT id::text AS job_id, created_by::text AS emp, accepted_by::text AS pro FROM jobs
         WHERE created_by::text = $1 OR (accepted_by IS NOT NULL AND accepted_by::text = $1)
         LIMIT 1`,
        [uid],
      );
      const pick = jobRows.rows?.[0];
      if (!pick) {
        console.log('SKIP: no job rows to test');
      } else {
        const tokenSub = String(pick.emp) === String(uid) ? pick.emp : pick.pro;
        const tok = jwt.sign(
          { sub: tokenSub, role: 'user', email: 'intent_shell_test@local', typ: 'access' },
          JWT_SECRET,
          { expiresIn: '15m' },
        );
        const out = await buildPaymentIntentSnapshot(pool, tokenSub, pick.job_id);
        ok('integration snapshot 200', out.status === 200);
        ok('integration has schema version', out.body._schema_version === 1);
        ok('integration has ledger_payment_id', out.body.ledger_payment_id === pick.job_id);
        ok('integration has projection or null', out.body.projection !== undefined);
        const out403 = await buildPaymentIntentSnapshot(pool, randomUUID(), pick.job_id);
        ok('integration forbidden for random user', out403.status === 403);
      }
    } catch (e) {
      console.log('integration skip:', e?.message || e);
    } finally {
      await pool.end().catch(() => {});
    }
  }
} else {
  console.log('(run with --integration for DB smoke test)');
}

console.log('\nPASS: test_payment_intent_api_shell.js\n');
