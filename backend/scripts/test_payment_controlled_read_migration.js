/**
 * Task 19D — Controlled canonical-first reads (projection path) + deterministic gateway fallback.
 *
 *   cd backend
 *   node scripts/test_payment_controlled_read_migration.js
 *   PAYMENT_CANONICAL_SHADOW=1 node scripts/test_payment_canonical_shadow.js
 *   node scripts/test_payment_dual_write_bridge.js
 *   node scripts/test_phase1a_regressions.js
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';
import dotenv from 'dotenv';

import { projectPaymentState } from '../lib/paymentStateProjection.js';
import { presentUxPaymentFromProjection } from '../lib/paymentResponsePresenter.js';
import {
  CANONICAL_SHADOW_CLASSIFICATION,
  classifyCanonicalShadowPure,
  clearControlledReadTelemetry,
  getControlledReadTelemetry,
  isCanonicalReadsEnabled,
  loadCanonicalBundleByGatewayTxId,
  mergeGatewayEvidenceForControlledRead,
  recordControlledReadLane,
  validateCanonicalBundleCompletenessForRead,
} from '../lib/paymentCanonicalShadow.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendDir = join(__dirname, '..');
dotenv.config({ path: join(backendDir, '.env') });
dotenv.config({ path: join(backendDir, '..', '.env') });

const argv = process.argv.slice(2);

function ok(label, cond, detail = '') {
  if (!cond) {
    console.error(`FAIL: ${label}`, detail || '');
    process.exit(1);
  }
  console.log(`OK: ${label}`);
}

function pj(ev) {
  return projectPaymentState(ev);
}

function deepEq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function buildPoolOrNull() {
  try {
    const timeoutMs = Math.min(
      Math.max(parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || '8000', 10) || 8000, 2000),
      15000,
    );
    const useUrl = argv.includes('--use-url') && process.env.DATABASE_URL;
    const ssl =
      process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: process.env.PGSSLMODE !== 'no-verify' };
    const cfg = useUrl
      ? {
          connectionString: process.env.DATABASE_URL,
          ssl,
          connectionTimeoutMillis: timeoutMs,
          max: 2,
        }
      : {
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432', 10),
          database: process.env.DB_DATABASE || process.env.DB_NAME || 'meera_db',
          user: process.env.DB_USER || 'meera',
          password: process.env.DB_PASSWORD || 'meera123',
          connectionTimeoutMillis: timeoutMs,
          max: 2,
        };
    const pool = new pg.Pool(cfg);
    /** @returns {Promise<import('pg').Pool>} */
    return pool;
  } catch {
    return null;
  }
}

function projBodyNoMutations(fnSrc) {
  const i = fnSrc.indexOf('export async function projectPaymentStateFromDb');
  ok('sanity: find projectPaymentStateFromDb', i >= 0);
  let depth = 0;
  let start = fnSrc.indexOf('{', fnSrc.indexOf(')', i));
  for (let p = start; p < fnSrc.length; p++) {
    const c = fnSrc[p];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        const body = fnSrc.slice(start + 1, p);
        return body;
      }
    }
  }
  return '';
}

console.log('\n=== Task 19D pure checks ===');

const gtxId = '11111111-1111-1111-1111-111111111111';

/* A + C — aligned canonical overlay ⇔ projection parity with gateway-shaped evidence */
{
  const evBase = {
    payment_id: 'pay1',
    ledger_rows: [],
    escrow_events: [],
    processed_webhook_keys: [],
  };
  const gw = { id: gtxId, status: 'CAPTURED', amount_minor: 500, settlement_status: null };
  const bundleOk = {
    payment: {
      status: 'CAPTURED',
      amount_minor: 500,
      active_attempt_id: '10',
    },
    attempts: [{ id: '10', gateway_transaction_id: gtxId }],
    transitions: [{ id: 1, from_status: '', to_status: 'CAPTURED' }],
  };
  ok('A precondition: completeness', validateCanonicalBundleCompletenessForRead(bundleOk, gtxId).ok);
  const cls = classifyCanonicalShadowPure({ bundle: bundleOk, gatewayRow: gw, uxPayload: null });
  ok('A precondition: shadow match', cls.classification === CANONICAL_SHADOW_CLASSIFICATION.match);

  const merged = mergeGatewayEvidenceForControlledRead(bundleOk, gw);
  const projGw = pj({ ...evBase, gateway_row: gw });
  const projCanon = pj({ ...evBase, gateway_row: merged });
  ok('C: projection parity (aligned canonical overlay)', deepEq(projGw, projCanon));
}

/* H — drift: canonical vs gateway ⇒ fallback semantics (explicit gateway-shaped row only for projection branch) */
{
  const evBase = {
    payment_id: 'payDrift',
    ledger_rows: [],
    escrow_events: [],
    processed_webhook_keys: [],
  };
  const gw = { id: gtxId, status: 'FAILED', amount_minor: 400, settlement_status: null };
  const bundleWrong = {
    payment: {
      status: 'CAPTURED',
      amount_minor: 400,
      active_attempt_id: '10',
    },
    attempts: [{ id: '10', gateway_transaction_id: gtxId }],
    transitions: [{ id: 1 }],
  };
  ok('H: completeness still ok before drift check', validateCanonicalBundleCompletenessForRead(bundleWrong, gtxId).ok);
  const drift = classifyCanonicalShadowPure({ bundle: bundleWrong, gatewayRow: gw, uxPayload: null });
  ok('H drift: shadow not match', drift.classification === CANONICAL_SHADOW_CLASSIFICATION.status_mismatch);
  const fallbackProj = pj({ ...evBase, gateway_row: gw });
  const wronglyMerged = pj({ ...evBase, gateway_row: mergeGatewayEvidenceForControlledRead(bundleWrong, gw) });
  ok('H: fallback avoids canonical overlay when drift', !deepEq(fallbackProj, wronglyMerged));
  ok('H: deterministic fallback projection', fallbackProj.gateway_status === 'FAILED');
}

/* I — canonical missing attempts */
{
  const bad = validateCanonicalBundleCompletenessForRead(
    { attempts: [], payment: { active_attempt_id: null }, transitions: [{ id: 1 }] },
    gtxId,
  );
  ok('I canonical missing ⇒ completeness fail', !bad.ok && bad.reason === 'missing_attempt_anchor');
}

/* G — legacy gateway_only (precanonical) */
{
  const cls = classifyCanonicalShadowPure({
    bundle: { attempts: [], payment: null, transitions: [] },
    gatewayRow: { id: gtxId, status: 'PENDING', amount_minor: 1 },
    uxPayload: null,
  });
  ok('G legacy classify', cls.classification === CANONICAL_SHADOW_CLASSIFICATION.missing_canonical);
  const comp = validateCanonicalBundleCompletenessForRead(
    { attempts: [], payment: null, transitions: [] },
    gtxId,
  );
  ok('G legacy completeness ⇒ fallback lane', !comp.ok);
}

/* D — presenter parity for equivalent projections */
{
  const proj = pj({
    payment_id: 'x',
    ledger_rows: [],
    escrow_events: [],
    gateway_row: { id: gtxId, status: 'PENDING', amount_minor: null, settlement_status: null },
    processed_webhook_keys: [],
  });
  const u1 = presentUxPaymentFromProjection(proj, { display_amount: '10' });
  const u2 = presentUxPaymentFromProjection(JSON.parse(JSON.stringify(proj)), { display_amount: '10' });
  ok('D: presenter deterministic', deepEq(u1, u2));
}

/* E — deterministic completeness + classify on same synthetic bundle */
{
  const b = {
    payment: { status: 'PENDING', amount_minor: 1, active_attempt_id: '1' },
    attempts: [{ id: '1', gateway_transaction_id: gtxId }],
    transitions: [{ id: 'a' }],
  };
  ok('E: repeatable completeness', validateCanonicalBundleCompletenessForRead(b, gtxId).ok === validateCanonicalBundleCompletenessForRead(b, gtxId).ok);
  const x = classifyCanonicalShadowPure({ bundle: b, gatewayRow: { id: gtxId, status: 'PENDING', amount_minor: 1 }, uxPayload: null });
  const y = classifyCanonicalShadowPure({ bundle: b, gatewayRow: { id: gtxId, status: 'PENDING', amount_minor: 1 }, uxPayload: null });
  ok('E: repeatable shadow classify', x.classification === y.classification);
}

/* F — no introduced created_at reliance in canonical read helpers / FromDb body */
{
  const shadow = readFileSync(join(backendDir, 'lib', 'paymentCanonicalShadow.js'), 'utf8');
  const i0 = shadow.indexOf('export function validateCanonicalBundleCompletenessForRead');
  const i1 = shadow.indexOf('export function classifyCanonicalShadowPure');
  ok('F: excerpt bounds', i0 >= 0 && i1 > i0);
  ok('F shadow 19D read helpers avoid created_at', !/created_at/i.test(shadow.slice(i0, i1)));
}
{
  const fullProj = readFileSync(join(backendDir, 'lib', 'paymentStateProjection.js'), 'utf8');
  const fnBlock = projBodyNoMutations(fullProj);
  ok('F FromDb avoids SQL created_at ordering', !/ORDER\s+BY[^\n]*created_at/i.test(fnBlock));
}

/* B — PAYMENT_CANONICAL_READS=0 preserves lane null / no forced canonical */
{
  const saved = process.env.PAYMENT_CANONICAL_READS;
  process.env.PAYMENT_CANONICAL_READS = '0';
  clearControlledReadTelemetry();
  ok('reads off ⇒ flag', !isCanonicalReadsEnabled());
  process.env.PAYMENT_CANONICAL_READS = '1';
  ok('reads on ⇒ flag', isCanonicalReadsEnabled());
  clearControlledReadTelemetry();
  recordControlledReadLane('canonical');
  ok('telemetry canonical when enabled', getControlledReadTelemetry().lane === 'canonical');
  process.env.PAYMENT_CANONICAL_READS = '0';
  recordControlledReadLane('gateway');
  ok('telemetry cleared when reads off', getControlledReadTelemetry().lane === null);

  const savedI = process.env.PAYMENT_INTENT_CUTOVER_READS;
  process.env.PAYMENT_INTENT_CUTOVER_READS = '1';
  clearControlledReadTelemetry();
  recordControlledReadLane('canonical');
  ok('Task 22: intent cutover alone enables telemetry', getControlledReadTelemetry().lane === 'canonical');
  if (savedI === undefined) delete process.env.PAYMENT_INTENT_CUTOVER_READS;
  else process.env.PAYMENT_INTENT_CUTOVER_READS = savedI;

  process.env.PAYMENT_CANONICAL_READS = saved;
}

/* J — read path avoids SQL mutation / enqueue */
{
  const fullProj = readFileSync(join(backendDir, 'lib', 'paymentStateProjection.js'), 'utf8');
  const body = projBodyNoMutations(fullProj).toUpperCase();
  ok('J no INSERT INTO in FromDb body', !body.includes('INSERT INTO'));
  ok('J no UPDATE in FromDb body (SQL writes)', !(body.includes('UPDATE ') || body.includes('UPDATE\n')));
  ok('J no DELETE FROM in FromDb body', !body.includes('DELETE FROM'));
  ok('J no enqueue in FromDb body', !body.includes('ENQUEUE'));
}

/** Optional DB probe — verifies bundle load + parity when dual-written rows exist */

async function probeDb(pool) {
  const savedReads = process.env.PAYMENT_CANONICAL_READS;
  try {
    const { projectPaymentStateFromDb } = await import('../lib/paymentStateProjection.js');

    const q = `
    SELECT id::text FROM gateway_transactions
    WHERE EXISTS (SELECT 1 FROM payment_attempts pa WHERE pa.gateway_transaction_id::text = gateway_transactions.id::text)
    ORDER BY gateway_transactions.id::text ASC
    LIMIT 3
  `;
    let rows = [];
    try {
      ({ rows } = await pool.query(q));
    } catch {
      return;
    }
    if (!rows.length) return;

    for (const { id } of rows) {
      const bundle = await loadCanonicalBundleByGatewayTxId(pool, id);
      if (!bundle?.payment?.id) continue;

      const refRows = await pool.query(
        `SELECT reference_id::text AS job_ref FROM payments WHERE id::text = $1 LIMIT 1`,
        [String(bundle.payment.id)],
      );
      const jobRef = refRows.rows[0]?.job_ref;
      if (!jobRef) continue;

      const gwRes = await pool.query(
        `SELECT id::text AS id, status::text AS status, amount_minor, settlement_status::text AS settlement_status
       FROM gateway_transactions WHERE id::text = $1 LIMIT 1`,
        [id],
      );
      const gwRow = gwRes.rows[0] || null;

      const cls = classifyCanonicalShadowPure({ bundle, gatewayRow: gwRow, uxPayload: null });

      process.env.PAYMENT_CANONICAL_READS = '1';
      clearControlledReadTelemetry();
      const projCanon = await projectPaymentStateFromDb(pool, {
        payment_id: jobRef,
        gateway_transaction_id: id,
      });
      const telAfterCanon = getControlledReadTelemetry().lane;

      process.env.PAYMENT_CANONICAL_READS = '0';
      clearControlledReadTelemetry();
      const projLegacy = await projectPaymentStateFromDb(pool, {
        payment_id: jobRef,
        gateway_transaction_id: id,
      });

      if (cls.classification !== CANONICAL_SHADOW_CLASSIFICATION.match) {
        ok(`DB parity shadow=${cls.classification} legacy≡canon read`, JSON.stringify(projLegacy) === JSON.stringify(projCanon));
        continue;
      }

      ok('DB parity match lane', telAfterCanon === 'canonical');
      ok('DB projection parity dual-written match', JSON.stringify(projLegacy) === JSON.stringify(projCanon));
    }

    ok('optional DB gateway_transactions fallback source still queryable', rows.length >= 1);
  } finally {
    if (savedReads === undefined) delete process.env.PAYMENT_CANONICAL_READS;
    else process.env.PAYMENT_CANONICAL_READS = savedReads;
  }
}

const pool = buildPoolOrNull();
if (!pool || argv.includes('--no-db')) {
  console.log('-- skip DB probe (--no-db or no pool)');
} else {
  try {
    console.log('\n=== Task 19D optional DB probe ===');
    await pool.query('SELECT 1');
    await probeDb(pool);
  } catch (e) {
    console.log('DB probe skipped:', e?.message || e);
  }
  await pool.end().catch(() => {});
}

clearControlledReadTelemetry();
console.log('\nTask 19D controlled read migration checks complete.\n');
console.log('gateway_transactions remains a supported deterministic fallback source during controlled migration.');
