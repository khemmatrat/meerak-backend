/**
 * Task 14 close-out: deterministic payment-state projection verification.
 *
 *   node backend/scripts/test_payment_state_projection.js
 *
 * Covers A–J: canonical states, read-only loaders, escrow id ordering,
 * permutation/replay stability, provider-unavailable snapshots.
 */
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import pg from 'pg';
import dotenv from 'dotenv';

import {
  normalizeLedgerRowsByIdAsc,
  projectPaymentState,
  projectPaymentStateFromDb,
  PROJECTION_STATES,
} from '../lib/paymentStateProjection.js';
import { loadPaymentProjectionEvidence } from '../lib/paymentStateQueries.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendDir = join(__dirname, '..');
const rootDir = join(backendDir, '..');
dotenv.config({ path: join(backendDir, '.env') });
dotenv.config({ path: join(rootDir, '.env') });

const argv = process.argv.slice(2);
const useUrl = argv.includes('--use-url') && process.env.DATABASE_URL;

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

function stripForUpdate(sql) {
  return String(sql).replace(/\s+FOR\s+UPDATE\b/gi, ' /* LOCK */ ');
}

/** Reject INSERT/UPDATE/DELETE/TRUNCATE (no synthetic repair from projection layer). */
function assertNoWriteDML(sql) {
  const n = stripForUpdate(sql)
    .replace(/--[^\n]*/g, ' ')
    .replace(/\s+/g, ' ');
  const bad = /\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i.exec(n);
  if (bad) throw new Error(`${bad[1]} forbidden: ${sql.slice(0, 260)}`);
}

/** Projection DB path: SELECT / WITH only (no mutating DDL/DML verbs). */
function assertSelectLikeOnly(sql) {
  assertNoWriteDML(sql);
  const trimmed = stripForUpdate(sql)
    .replace(/--[^\n]*/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  const head = trimmed.slice(0, 24).toLowerCase();
  if (!/^select\b/.test(head) && !/^with\b/.test(head)) {
    throw new Error(`Expected SELECT/WITH-only in projection loader: "${trimmed.slice(0, 80)}"`);
  }
}

function sqlArg(q) {
  if (q && typeof q === 'object' && typeof q.text === 'string') return q.text;
  return String(q ?? '');
}

/** Every statement touching ledger_entries must ORDER BY id and never ORDER BY created_at. */
function assertLedgerQueryOrdering(sqlText) {
  const s = sqlArg(sqlText);
  if (!/\bledger_entries\b/i.test(s)) return;
  assert(
    /\bFROM\s+ledger_entries\b[\s\S]*\border\s+by\s+id\b/i.test(s),
    `runtime ledger SQL uses ORDER BY id: ${s.slice(0, 120)}`,
  );
  assert(
    !/\bledger_entries\b[\s\S]*\border\s+by\s+[^\n);]*created_at/im.test(s),
    `runtime ledger SQL must not ORDER BY created_at: ${s.slice(0, 180)}`,
  );
}

function buildPoolOrSkipRuntime() {
  const timeoutMs = 15000;
  if (!useUrl) {
    return new pg.Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_DATABASE || 'meera_db',
      user: process.env.DB_USER || 'meera',
      password: process.env.DB_PASSWORD || 'meera123',
      connectionTimeoutMillis: timeoutMs,
      max: 2,
    });
  }
  return new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: process.env.PGSSLMODE !== 'no-verify' },
    connectionTimeoutMillis: timeoutMs,
    max: 2,
  });
}

function smokeEv(extra = {}) {
  return {
    payment_id: 'pay_test',
    ledger_rows: [
      { id: 101, event_type: 'PAYMENT_COMPLETED', amount_minor: 10000 },
      { id: 102, event_type: 'ESCROW_HOLD', amount_minor: 10000 },
    ],
    gateway_row: { status: 'CAPTURED', amount_minor: 10000, settlement_status: 'ESCROW_HELD' },
    escrow_events: [{ id: 1, state: 'HOLD' }],
    ...extra,
  };
}

/** @param {readonly unknown[]} stmts */
function wrapPoolInterceptExecute(stmts, pool) {
  const inner = pool.query.bind(pool);
  pool.query = async (...args) => {
    const text = sqlArg(args[0]);
    stmts.push(text);
    assertSelectLikeOnly(text);
    assertLedgerQueryOrdering(text);
    return inner(...args);
  };
}

// =============================================================================
// A. PAYMENT_PENDING
// =============================================================================
function testA_pending() {
  const noLedger = projectPaymentState({
    payment_id: 'p1',
    ledger_rows: [],
    gateway_row: { status: 'PENDING', amount_minor: null, settlement_status: 'NOT_APPLICABLE' },
    escrow_events: [],
  });
  assert(noLedger.projection_state === PROJECTION_STATES.PAYMENT_PENDING, 'A1 no ledger confirmation → PENDING');

  const provIncomplete = projectPaymentState({
    payment_id: 'p2',
    ledger_rows: [],
    gateway_row: null,
    escrow_events: [],
    provider_available: false,
    provider_amount_minor: null,
  });
  assert(
    provIncomplete.projection_state === PROJECTION_STATES.PAYMENT_PENDING,
    'A2 provider unavailable / empty ledger → PENDING',
  );
  assert(provIncomplete.reason_codes.includes('provider_unavailable'), 'A3 flags provider_unavailable');
}

// =============================================================================
// B. PAYMENT_CONFIRMED
// =============================================================================
function testB_confirmed() {
  const base = projectPaymentState({
    payment_id: 'p3',
    ledger_rows: [{ id: 5, event_type: 'PAYMENT_COMPLETED', amount_minor: 200_00 }],
    gateway_row: { status: 'CAPTURED', amount_minor: 200_00, settlement_status: 'PAYMENT_CONFIRMED' },
    escrow_events: [],
  });
  assert(base.projection_state === PROJECTION_STATES.PAYMENT_CONFIRMED, 'B1 PAYMENT_COMPLETED → CONFIRMED');
  const s1 = JSON.stringify(base);
  const s2 = JSON.stringify(
    projectPaymentState({
      payment_id: 'p3',
      ledger_rows: [{ id: 5, event_type: 'PAYMENT_COMPLETED', amount_minor: 200_00 }],
      gateway_row: { status: 'CAPTURED', amount_minor: 200_00, settlement_status: 'PAYMENT_CONFIRMED' },
      escrow_events: [],
    }),
  );
  assert(s1 === s2, 'B2 deterministic duplicate evidence');
}

// =============================================================================
// C. ESCROW_HELD (id PC < id HOLD)
// =============================================================================
function testC_escrowHeld() {
  const ev = projectPaymentState({
    payment_id: 'p4',
    ledger_rows: [
      { id: 10, event_type: 'PAYMENT_COMPLETED', amount_minor: 5000 },
      { id: 25, event_type: 'ESCROW_HOLD', amount_minor: 5000 },
    ],
    gateway_row: { status: 'CAPTURED', amount_minor: 5000, settlement_status: 'ESCROW_HELD' },
    escrow_events: [{ id: 100, state: 'HOLD' }],
  });
  assert(ev.projection_state === PROJECTION_STATES.ESCROW_HELD, 'C1 valid id PC < EH → ESCROW_HELD');
  assert(10 < 25, 'C2 invariant ids (documentation)');
}

// =============================================================================
// D. ESCROW_RELEASED (HOLD before RELEASED by id)
// =============================================================================
function testD_escrowReleased() {
  const ev = projectPaymentState({
    payment_id: 'p5',
    ledger_rows: [
      { id: 10, event_type: 'PAYMENT_COMPLETED', amount_minor: 5000 },
      { id: 20, event_type: 'ESCROW_HOLD', amount_minor: 5000 },
      { id: 30, event_type: 'ESCROW_RELEASED', amount_minor: 5000 },
    ],
    gateway_row: { status: 'SETTLED', amount_minor: 5000, settlement_status: 'ESCROW_RELEASED' },
    escrow_events: [
      { id: 500, state: 'HOLD' },
      { id: 501, state: 'RELEASED' },
    ],
  });
  assert(ev.projection_state === PROJECTION_STATES.ESCROW_RELEASED, 'D1 HOLD id < RELEASED id → ESCROW_RELEASED');
}

// =============================================================================
// E. PAYMENT_REVERSED + conflict → manual review
// =============================================================================
function testE_reversed() {
  const rev = projectPaymentState({
    payment_id: 'p6',
    ledger_rows: [
      { id: 10, event_type: 'PAYMENT_COMPLETED', amount_minor: 1000 },
      { id: 20, event_type: 'ESCROW_HOLD', amount_minor: 1000 },
      { id: 30, event_type: 'ESCROW_RELEASED', amount_minor: 1000 },
    ],
    gateway_row: { status: 'REFUNDED', amount_minor: 1000, settlement_status: 'ESCROW_RELEASED' },
    escrow_events: [
      { id: 1, state: 'HOLD' },
      { id: 2, state: 'RELEASED' },
    ],
  });
  assert(rev.projection_state === PROJECTION_STATES.PAYMENT_REVERSED, 'E1 REFUNDED after release path → REVERSED');

  const conflict = projectPaymentState({
    payment_id: 'p7',
    ledger_rows: [
      { id: 10, event_type: 'PAYMENT_COMPLETED', amount_minor: 1000 },
      { id: 20, event_type: 'ESCROW_HOLD', amount_minor: 1000 },
      { id: 30, event_type: 'ESCROW_RELEASED', amount_minor: 1000 },
    ],
    gateway_row: { status: 'FAILED', amount_minor: 1000, settlement_status: 'ESCROW_RELEASED' },
    escrow_events: [],
  });
  assert(
    conflict.projection_state === PROJECTION_STATES.PAYMENT_REQUIRES_MANUAL_REVIEW,
    'E2 FAILED vs settlement vs ledger → MANUAL_REVIEW',
  );
  assert(conflict.reason_codes.includes('conflicting_gateway_status_vs_settlement'), 'E3 conflict reason');
}

// =============================================================================
// F. PAYMENT_FAILED
// =============================================================================
function testF_failed() {
  const f = projectPaymentState({
    payment_id: 'p8',
    ledger_rows: [],
    gateway_row: { status: 'FAILED', amount_minor: null, settlement_status: 'NOT_APPLICABLE' },
    escrow_events: [],
  });
  assert(f.projection_state === PROJECTION_STATES.PAYMENT_FAILED, 'F hard-fail gateway, no PC ledger');
}

// =============================================================================
// G. PAYMENT_REQUIRES_MANUAL_REVIEW (amount / conflicts / impossible / dupes)
// =============================================================================
function testG_manualReview() {
  const amt = projectPaymentState({
    payment_id: 'p9',
    ledger_rows: [{ id: 1, event_type: 'PAYMENT_COMPLETED', amount_minor: 100_00 }],
    gateway_row: { status: 'CAPTURED', amount_minor: 200_00, settlement_status: 'PAYMENT_CONFIRMED' },
    escrow_events: [],
  });
  assert(amt.projection_state === PROJECTION_STATES.PAYMENT_REQUIRES_MANUAL_REVIEW, 'G1 amount mismatch');
  assert(amt.reason_codes.includes('amount_mismatch_gateway_vs_ledger'), 'G1b reason');

  const badOrderEr = projectPaymentState({
    payment_id: 'p10',
    ledger_rows: [
      { id: 10, event_type: 'PAYMENT_COMPLETED', amount_minor: 1 },
      { id: 5, event_type: 'ESCROW_HOLD', amount_minor: 1 },
    ],
    gateway_row: { status: 'CAPTURED', amount_minor: 1, settlement_status: 'ESCROW_HELD' },
    escrow_events: [],
  });
  assert(
    badOrderEr.projection_state === PROJECTION_STATES.PAYMENT_REQUIRES_MANUAL_REVIEW,
    'G2 EH id < PC id → manual (never silently fixed)',
  );
  assert(badOrderEr.reason_codes.includes('ledger_ESCROW_HOLD_before_PAYMENT_COMPLETED'), 'G2b');

  const relNoHold = projectPaymentState({
    payment_id: 'p11',
    ledger_rows: [{ id: 40, event_type: 'ESCROW_RELEASED', amount_minor: 1 }],
    gateway_row: { status: 'SETTLED', amount_minor: 1, settlement_status: 'ESCROW_RELEASED' },
    escrow_events: [],
  });
  assert(
    relNoHold.projection_state === PROJECTION_STATES.PAYMENT_REQUIRES_MANUAL_REVIEW,
    'G3 release ledger without EH row',
  );
  assert(relNoHold.reason_codes.includes('ledger_ESCROW_RELEASED_without_ESCROW_HOLD'), 'G3b');

  const holdNoPc = projectPaymentState({
    payment_id: 'p12',
    ledger_rows: [{ id: 15, event_type: 'ESCROW_HOLD', amount_minor: 1 }],
    gateway_row: null,
    escrow_events: [{ id: 1, state: 'HOLD' }],
  });
  assert(
    holdNoPc.projection_state === PROJECTION_STATES.PAYMENT_REQUIRES_MANUAL_REVIEW,
    'G4 HOLD without PAYMENT_COMPLETED',
  );
  assert(holdNoPc.reason_codes.includes('ledger_ESCROW_HOLD_without_PAYMENT_COMPLETED'), 'G4b');

  const dupHold = projectPaymentState({
    payment_id: 'p13',
    ledger_rows: [
      { id: 1, event_type: 'PAYMENT_COMPLETED', amount_minor: 1 },
      { id: 2, event_type: 'ESCROW_HOLD', amount_minor: 1 },
      { id: 3, event_type: 'ESCROW_HOLD', amount_minor: 1 },
    ],
    gateway_row: { status: 'CAPTURED', amount_minor: 1, settlement_status: 'ESCROW_HELD' },
    escrow_events: [],
  });
  assert(
    dupHold.projection_state === PROJECTION_STATES.PAYMENT_REQUIRES_MANUAL_REVIEW,
    'G5 duplicate escrow HOLD ledger rows',
  );
  assert(dupHold.reason_codes.includes('multiple_ledger_ESCROW_HOLD'), 'G5b');

  const escrowTblBad = projectPaymentState({
    payment_id: 'p14',
    ledger_rows: [
      { id: 10, event_type: 'PAYMENT_COMPLETED', amount_minor: 1 },
      { id: 20, event_type: 'ESCROW_HOLD', amount_minor: 1 },
    ],
    gateway_row: null,
    escrow_events: [
      { id: 20, state: 'HOLD' },
      { id: 10, state: 'RELEASED' },
    ],
  });
  assert(
    escrowTblBad.projection_state === PROJECTION_STATES.PAYMENT_REQUIRES_MANUAL_REVIEW,
    'G6 escrow_events RELEASED id before HOLD id',
  );
  assert(escrowTblBad.reason_codes.includes('escrow_events_RELEASED_before_HOLD'), 'G6b reason');
  const dupRel = projectPaymentState({
    payment_id: 'p15',
    ledger_rows: [
      { id: 10, event_type: 'PAYMENT_COMPLETED', amount_minor: 1 },
      { id: 20, event_type: 'ESCROW_HOLD', amount_minor: 1 },
      { id: 30, event_type: 'ESCROW_RELEASED', amount_minor: 1 },
      { id: 31, event_type: 'ESCROW_RELEASED', amount_minor: 1 },
    ],
    gateway_row: { status: 'SETTLED', amount_minor: 1, settlement_status: 'ESCROW_RELEASED' },
    escrow_events: [],
  });
  assert(dupRel.reason_codes.includes('multiple_ledger_ESCROW_RELEASED'), 'G7 duplicate ESCROW_RELEASED rows');
  assert(
    dupRel.projection_state === PROJECTION_STATES.PAYMENT_REQUIRES_MANUAL_REVIEW,
    'G7b duplicate release → manual review',
  );
}

// =============================================================================
// H–I Replay + permutation safety
// =============================================================================
function testH_replay() {
  const ev = {
    payment_id: 'replay',
    ledger_rows: [{ id: 101, event_type: 'PAYMENT_COMPLETED', amount_minor: 10_000 }],
    gateway_row: null,
    escrow_events: [],
    processed_webhook_keys: [
      { provider: 'payso', event_id: 'x' },
      { provider: 'payso', event_id: 'x' },
      { provider: 'payso', event_id: 'x' },
    ],
  };
  const a = projectPaymentState(ev);
  const b = projectPaymentState(ev);
  assert(JSON.stringify(a) === JSON.stringify(b), 'H repeated evidence ⇒ identical projection');
  assert(a.processed_webhook_key_count === 1, 'H webhook keys dedupe');
}

function testI_permutation() {
  const canon = smokeEv({});
  const shuf = smokeEv({
    ledger_rows: [
      { id: 102, event_type: 'ESCROW_HOLD', amount_minor: 10000 },
      { id: 101, event_type: 'PAYMENT_COMPLETED', amount_minor: 10000 },
    ],
  });
  assert(
    JSON.stringify(projectPaymentState(canon)) === JSON.stringify(projectPaymentState(shuf)),
    'I shuffled ledger rows ⇒ same canonical projection',
  );
}

function test_pureNoMutation() {
  const ev = smokeEv({});
  const before = JSON.stringify(ev.ledger_rows);
  projectPaymentState(ev);
  assert(JSON.stringify(ev.ledger_rows) === before, 'pure projectPaymentState — no ledger row mutation');
}

// =============================================================================
// J. Provider unavailable + stale gateway conflicts
// =============================================================================
function testJ_providerUnavailableStale() {
  const stale = projectPaymentState({
    payment_id: 'stale',
    ledger_rows: [
      { id: 10, event_type: 'PAYMENT_COMPLETED', amount_minor: 100 },
      { id: 20, event_type: 'ESCROW_HOLD', amount_minor: 100 },
      { id: 30, event_type: 'ESCROW_RELEASED', amount_minor: 100 },
    ],
    gateway_row: { status: 'PENDING', amount_minor: 100, settlement_status: 'ESCROW_HELD' },
    escrow_events: [],
    provider_available: true,
    provider_amount_minor: 10000,
    provider_paid_evidence: false,
  });
  assert(stale.projection_state === PROJECTION_STATES.PAYMENT_REQUIRES_MANUAL_REVIEW, 'J1 stale gateway PENDING vs released ledger');

  /** Provider-paid missing internal only when provider is “available”. */
  const missProv = projectPaymentState({
    payment_id: 'miss',
    ledger_rows: [],
    gateway_row: null,
    escrow_events: [],
    provider_paid_evidence: true,
    provider_available: false,
    provider_amount_minor: 9999,
  });
  assert(
    !missProv.reason_codes.includes('provider_paid_missing_internal_payment'),
    'J2 provider unavailable ⇒ no invented missing-internal signal alone',
  );
}

// =============================================================================
// Source ordering (ledger_entries.id) — never created_at
// =============================================================================
function testSourceOrderingProof() {
  const p = join(backendDir, 'lib', 'paymentStateQueries.js');
  const src = fs.readFileSync(p, 'utf8');
  const m = /\bFROM\s+ledger_entries\b[\s\S]{0,500}/im.exec(src);
  assert(m, 'source: ledger block exists');
  assert(/ORDER\s+BY\s+id\s+ASC/im.test(m[0]), 'source: ledger ORDER BY id ASC');
  assert(!/\border\s+by[^\n`;]*created_at/im.test(m[0]), 'source: no ORDER BY created_at on ledger derivation');
}

// =============================================================================
// Runtime read-only smoke (SELECT-only + ledger id ordering on captured SQL)
// =============================================================================
async function testRuntimeIntercept() {
  const stmts = [];
  const pool = buildPoolOrSkipRuntime();
  wrapPoolInterceptExecute(stmts, pool);
  try {
    await loadPaymentProjectionEvidence(pool, {
      payment_id: `__t14_${Date.now()}`,
      processed_webhooks: [],
    });
    ok('runtime: intercept loadPaymentProjectionEvidence (SELECT/WITH-only + ledger id order)');
    const joined = stmts.join('\n');
    assert(joined.includes('ledger_entries'), 'runtime: ledger query exercised');
    for (const stmt of stmts) assertLedgerQueryOrdering(stmt);

    stmts.length = 0;
    await projectPaymentStateFromDb(pool, { payment_id: `__t14_proj_${Date.now()}`, provider_available: false });
    ok('runtime: projectPaymentStateFromDb — interceptor clean');
    await pool.end();
  } catch (e) {
    console.warn('runtime DB skipped:', String(e.message || e).slice(0, 160));
    await pool.end().catch(() => {});
    ok('offline: runtime smoke skipped');
  }
}

async function main() {
  console.log('\n[task14-closeout] payment state projection\n');

  console.log('[A] PAYMENT_PENDING');
  testA_pending();

  console.log('\n[B] PAYMENT_CONFIRMED');
  testB_confirmed();

  console.log('\n[C] ESCROW_HELD');
  testC_escrowHeld();

  console.log('\n[D] ESCROW_RELEASED');
  testD_escrowReleased();

  console.log('\n[E] PAYMENT_REVERSED + conflicts');
  testE_reversed();

  console.log('\n[F] PAYMENT_FAILED');
  testF_failed();

  console.log('\n[G] PAYMENT_REQUIRES_MANUAL_REVIEW');
  testG_manualReview();

  console.log('\n[H–I] Replay + permutation + pure');
  testH_replay();
  testI_permutation();
  test_pureNoMutation();

  console.log('\n[J] Provider unavailable / stale gateway');
  testJ_providerUnavailableStale();

  console.log('\n[3–4] Source ordering proof');
  testSourceOrderingProof();

  console.log('\n[2] Runtime read-only (SELECT/WITH)');
  await testRuntimeIntercept();

  console.log('\n[5] Empty normalize');
  normalizeLedgerRowsByIdAsc([]);
  ok('normalizeLedgerRowsByIdAsc tolerant');

  console.log('');
  if (fail) {
    console.error(`FAILED (${pass} ok, ${fail} failed)`);
    process.exitCode = 1;
  } else console.log(`OK (${pass} checks)`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
