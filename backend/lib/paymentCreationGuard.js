/**
 * Task 17 + addendum: payment creation guard (rate limits, correlation, deterministic errors).
 * Duplicate reuse uses projection → presenter UX only (never raw gateway status alone, no created_at heuristics).
 * Does not mutate reconciliation, webhooks, outbound, or ledger semantics on reuse paths.
 */

import { randomUUID } from 'crypto';
import { buildTransactionMetadata } from './paymentAdapter.js';
import { projectPaymentStateFromDb } from './paymentStateProjection.js';
import { presentUxPaymentFromProjection } from './paymentResponsePresenter.js';
import { normalizePaymentChannel, getLocalGatewayFromEnv } from './paymentProviderGate.js';
import { GATEWAY_TX_STATUS } from '../internal-gateway/constants.js';
import {
  mirrorGatewayStatusToCanonicalColumn,
  findCanonicalPaymentIdByGatewayTxId,
  insertPaymentDualWriteMirror,
} from './paymentIntentRepository.js';
import { insertGatewayAnchoredAttemptMirror } from './paymentAttemptRepository.js';
import { appendTransitionSkeleton, countTransitionsForPayment } from './paymentTransitionRepository.js';

export const PAYMENT_CREATE_FAILURE_CODES = Object.freeze({
  RATE_LIMITED: 'PAYMENT_CREATE_RATE_LIMITED',
  FORBIDDEN: 'forbidden_not_employer',
  INVALID_JOB: 'invalid_job_status',
});

export const UX_REUSABLE_STATUSES = Object.freeze(
  new Set(['pending', 'awaiting_payment', 'processing']),
);

const MAX_CLIENT_REF_LEN = 128;
const RATE_WINDOW_SEC = 60;
const RATE_MAX_BURST = 5;

let _schemaReady = false;

export async function ensurePaymentCreationGuardSchema(pool) {
  if (_schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_creation_rate_events (
      id BIGSERIAL PRIMARY KEY,
      actor_user_key TEXT NOT NULL,
      logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS ix_payment_create_rate_actor_time
    ON payment_creation_rate_events (actor_user_key, logged_at DESC)`);
  _schemaReady = true;
}

/**
 * @param {unknown} raw
 * @returns {{ value: string | null }}
 */
export function normalizeClientReferenceId(raw) {
  if (raw == null || raw === '') return { value: null };
  let s = String(raw).normalize('NFKC').trim();
  if (!s.length) return { value: null };
  if (s.length > MAX_CLIENT_REF_LEN) s = s.slice(0, MAX_CLIENT_REF_LEN);
  if (!/^[a-zA-Z0-9._:@-]+$/.test(s)) {
    const cleaned = [...s].filter((c) => /[a-zA-Z0-9._:@-]/.test(c)).join('');
    s = cleaned.slice(0, MAX_CLIENT_REF_LEN);
  }
  return { value: s.length ? s : null };
}

/**
 * Mirrors Stripe PI employer check — resolved canonical employer UUID string.
 */
export async function resolveEmployerAccessToMatchJob(pool, job, userId) {
  const employerId = String(job.created_by || '').trim();
  const uid = String(userId || '').trim();
  if (!employerId || !uid) {
    const e = new Error('forbidden_not_employer');
    e.code = 'FORBIDDEN';
    throw e;
  }
  if (employerId === uid) return employerId;
  const urow = await pool.query(
    `SELECT id, firebase_uid FROM users WHERE id::text = $1 OR firebase_uid = $1 LIMIT 1`,
    [uid],
  );
  const internal = urow.rows?.[0];
  if (!internal || String(internal.id) !== String(job.created_by)) {
    const err = new Error('forbidden_not_employer');
    err.code = 'FORBIDDEN';
    throw err;
  }
  return String(internal.id);
}

/** @param {object} job */
export function assertJobPayableMatchStatus(job) {
  const statusOk = String(job.status || '').toLowerCase();
  if (statusOk !== 'waiting_for_payment' && statusOk !== 'waiting_for_approval') {
    const e = new Error('invalid_job_status');
    e.code = 'INVALID_JOB_STATUS';
    throw e;
  }
}

/**
 * DB-backed sliding window burst limit (PostgreSQL — multi-instance safe).
 */
export async function consumePaymentCreationBudget(pool, p) {
  const actorUserKey = String(p.actorUserKey || '').slice(0, 256);
  const windowSec = Number.isFinite(Number(p.windowSec)) ? Number(p.windowSec) : RATE_WINDOW_SEC;
  const maxBurst = Number.isFinite(Number(p.maxBurst)) ? Number(p.maxBurst) : RATE_MAX_BURST;

  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(`SELECT pg_advisory_xact_lock(hashtextextended($1::text, 42)::bigint)`, [
      `pay:create:rate:${actorUserKey}`,
    ]);
    const retentionMin = Math.max(2, Math.ceil(windowSec / 60) + 2);
    await c.query(`DELETE FROM payment_creation_rate_events WHERE logged_at < NOW() - ($1::int * INTERVAL '1 minute')`, [
      retentionMin,
    ]);
    const ins = await c.query(
      `
      INSERT INTO payment_creation_rate_events(actor_user_key)
      SELECT $1
      WHERE (
        SELECT COUNT(*)::bigint FROM payment_creation_rate_events e
        WHERE e.actor_user_key = $1
          AND e.logged_at > NOW() - ($2 * INTERVAL '1 second')
      ) < $3::int
      RETURNING id
    `,
      [actorUserKey, windowSec, maxBurst],
    );
    if (!ins.rows?.length) {
      await c.query('ROLLBACK');
      return { ok: false };
    }
    await c.query('COMMIT');
    return { ok: true };
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

function buildQrPlaceholderDataUrl(amountThb) {
  const label = `AQOND ${Number(amountThb).toFixed(2)} THB`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#fff"/><text x="128" y="120" text-anchor="middle" font-size="12" fill="#111">${label}</text><text x="128" y="142" text-anchor="middle" font-size="10" fill="#666">Scan with banking app</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function normalizeGwRow(row) {
  if (!row) return row;
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

/**
 * @param {object} gwRow gateway_transactions-shaped row
 */
export async function buildUxPayloadForGatewayRow(pool, gwRow, { displayAmount, traceId }) {
  const r = normalizeGwRow(gwRow);
  const payKey = String(r.external_ref || r.merchant_reference || '').trim();
  const proj = await projectPaymentStateFromDb(pool, {
    payment_id: payKey || String(r.job_id || ''),
    gateway_transaction_id: String(r.id),
  });
  const pd = r.metadata && typeof r.metadata === 'object' ? r.metadata : {};
  const qrExp =
    pd.qr_expires_at ||
    pd.qr_expires ||
    pd.expires_at ||
    pd.payment_qr_expires_at ||
    pd.expires ||
    null;
  return presentUxPaymentFromProjection(proj, {
    trace_id: traceId,
    display_amount: displayAmount,
    expires_at: qrExp != null ? String(qrExp) : null,
    awaiting_user_hint: !!(pd.awaiting_payment === true || pd.qr_pending === true || pd.promptpay_pending === true),
    open_qr: !!(pd.payment_qr_url || pd.qr_code_url || pd.qr_payload || pd.promptpay_pending),
    open_redirect: !!(pd.requires_action_web === true || pd.three_ds_required === true),
  });
}

export function publicPaymentExternalRef() {
  return `aqpp_${randomUUID().replace(/-/g, '')}`;
}

export function paymentCreateRateLimitedBody(trace_id, retryAfterSeconds) {
  const s = Math.max(1, Math.ceil(Number(retryAfterSeconds) || 60));
  return {
    success: false,
    failure_code: PAYMENT_CREATE_FAILURE_CODES.RATE_LIMITED,
    retry_after_seconds: s,
    retry_after: s,
    trace_id: String(trace_id || `pay_rl:${randomUUID()}`),
    ux: null,
  };
}

export function toPaymentGatewayClientShape(gwRow, {
  amountThb,
  gatewayLabel,
  clientReferenceId,
  traceId,
  ux,
  reused_duplicate_active,
}) {
  const nr = normalizeGwRow(gwRow);
  const idShort = String(nr.id || '').replace(/-/g, '').slice(0, 10).toUpperCase();
  const createdIso =
    nr.created_at instanceof Date ? nr.created_at.toISOString() : String(nr.created_at || new Date().toISOString());
  const baseUx = {
    ...(ux || {}),
    ...(clientReferenceId ? { client_reference_id: clientReferenceId } : {}),
  };
  return {
    success: true,
    payment_id: String(nr.external_ref || nr.id),
    gateway: gatewayLabel,
    status: 'pending',
    qr_code_url: nr.placeholder_qr_url || buildQrPlaceholderDataUrl(amountThb),
    amount: Number(amountThb),
    currency: String(nr.currency || 'THB'),
    bill_no: `BL-${idShort}`,
    transaction_no: `TX-${idShort}`,
    created_at: createdIso,
    client_reference_id: clientReferenceId || undefined,
    trace_id: traceId,
    ux: baseUx,
    reused_duplicate_active: !!reused_duplicate_active,
  };
}

async function insertGatewayRow(client, { externalRef, jobId, employerId, amountMinor, metaObj }) {
  try {
    const r = await client.query(
      `INSERT INTO gateway_transactions (
         external_ref, merchant_reference, amount_minor, currency, status, metadata, job_id, release_rules, fraud_flags
       ) VALUES (
         $1, $2, $3, COALESCE($4, 'THB'), $5, $6::jsonb, $7, '{}'::jsonb, '{}'::jsonb
       )
       RETURNING id::text AS id, external_ref, merchant_reference, status, amount_minor, currency, metadata, job_id, created_at`,
      [
        externalRef,
        jobId,
        amountMinor,
        'THB',
        GATEWAY_TX_STATUS.PENDING,
        JSON.stringify(metaObj),
        jobId,
      ],
    );
    return r.rows?.[0];
  } catch (e) {
    if (e && e.code === '42703') {
      const r2 = await client.query(
        `INSERT INTO gateway_transactions (
           external_ref, merchant_reference, amount_minor, currency, status, metadata
         ) VALUES ($1, $2, $3, COALESCE($4, 'THB'), $5, $6::jsonb)
         RETURNING id::text AS id, external_ref, merchant_reference, status, amount_minor, currency, metadata, job_id, created_at`,
        [externalRef, jobId, amountMinor, 'THB', GATEWAY_TX_STATUS.PENDING, JSON.stringify(metaObj)],
      );
      return r2.rows?.[0];
    }
    throw e;
  }
}

async function canonicalDualWriteSchemaReady(client) {
  const r = await client.query(
    `SELECT
       to_regclass('public.payments') IS NOT NULL AS p,
       to_regclass('public.payment_attempts') IS NOT NULL AS a,
       to_regclass('public.payment_status_transitions') IS NOT NULL AS s`,
  );
  return !!(r.rows[0]?.p && r.rows[0]?.a && r.rows[0]?.s);
}

/**
 * Task 19B: dual-write canonical rows in the same transaction as gateway create / reuse.
 * gateway_transactions remains the production read source (no projection/presenter flip).
 */
async function dualWriteEnsureCanonicalMatchJobMirror(client, {
  gwRow,
  employerId,
  job,
  amountThb,
  normalizedClientReference,
  traceId,
  paymentChannel,
}) {
  if (!(await canonicalDualWriteSchemaReady(client))) return;
  const gwId = String(gwRow?.id || '').trim();
  if (!gwId) return;

  const existingPayId = await findCanonicalPaymentIdByGatewayTxId(client, gwId);
  if (existingPayId) {
    const tc = await countTransitionsForPayment(client, existingPayId);
    if (tc === 0) {
      const mirrored = mirrorGatewayStatusToCanonicalColumn(gwRow.status);
      await appendTransitionSkeleton(client, {
        paymentId: existingPayId,
        fromStatus: null,
        toStatus: mirrored,
        transitionSource: 'dual_write_reuse_backfill',
        traceId,
        metadata: { initial_anchor: true },
      });
    }
    return;
  }

  const mirrored = mirrorGatewayStatusToCanonicalColumn(gwRow.status);
  const jobUuid = String(job.id || '').trim();
  const amountMinor =
    gwRow.amount_minor != null ? gwRow.amount_minor : Math.max(0, Math.round(Number(amountThb) * 100));
  const currency = String(gwRow.currency || 'THB').slice(0, 3).toUpperCase();
  const provider = String(getLocalGatewayFromEnv() || 'payso');
  const method = String(normalizePaymentChannel(paymentChannel) || 'promptpay');

  const payMeta = {
    dual_write_mirror: true,
    gateway_transaction_id: gwId,
    gateway_external_ref: gwRow.external_ref || null,
    ...(normalizedClientReference ? { meerak_client_reference: normalizedClientReference } : {}),
    trace_route: 'paymentCreationGuard.match_job',
  };

  const pay = await insertPaymentDualWriteMirror(client, {
    userId: employerId,
    jobUuid,
    mirroredStatus: mirrored,
    amountMinor,
    currency,
    metadata: payMeta,
  });
  if (!pay?.id) {
    const err = new Error('dual_write_payment_insert_failed');
    err.code = 'DUAL_WRITE_PAYMENT_INSERT_FAILED';
    throw err;
  }

  const att = await insertGatewayAnchoredAttemptMirror(client, {
    paymentId: String(pay.id),
    provider,
    method,
    gatewayTransactionId: gwId,
    providerReference: gwRow.external_ref || null,
    mirroredStatus: mirrored,
    metadata: {
      dual_write_mirror: true,
      trace_route: 'paymentCreationGuard.match_job',
    },
  });
  if (!att?.id) {
    const err = new Error('dual_write_attempt_insert_failed');
    err.code = 'DUAL_WRITE_ATTEMPT_INSERT_FAILED';
    throw err;
  }

  await client.query(`UPDATE payments SET active_attempt_id = $1::uuid WHERE id = $2::uuid`, [
    String(att.id),
    String(pay.id),
  ]);

  await appendTransitionSkeleton(client, {
    paymentId: String(pay.id),
    fromStatus: null,
    toStatus: mirrored,
    transitionSource: 'dual_write_creation',
    traceId,
    metadata: { initial_anchor: true },
  });
}

/**
 * @param {import('pg').Pool} pool
 */
export async function lockedCreateOrReuseMatchJobGatewayPayment(pool, args) {
  const {
    job,
    employerId,
    normalizedClientReference,
    amountThb,
    gatewayUi,
    traceId,
    paymentChannel,
  } = args;
  const jobId = String(job.id || '').trim();

  const corrSuperset = JSON.stringify({
    meerak_job_id: jobId,
    meerak_client_reference: normalizedClientReference,
    meerak_user_id: String(employerId),
  });

  const metaObj = buildTransactionMetadata({
    jobId,
    userId: employerId,
    paymentChannel: normalizePaymentChannel(paymentChannel),
    paymentGateway: getLocalGatewayFromEnv(),
    extra: {
      meerak_job_id: jobId,
      meerak_client_reference: normalizedClientReference || undefined,
      meerak_user_id: String(employerId),
      purpose: 'job_checkout',
      gateway_ui: gatewayUi,
    },
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const lk = await client.query(`SELECT hashtextextended($1::text, 0)::bigint AS k`, [
      `pay:create_corr|${jobId}|${employerId}|${normalizedClientReference ?? '∅legacy'}`,
    ]);
    await client.query(`SELECT pg_advisory_xact_lock($1)`, [lk.rows[0].k]);

    if (normalizedClientReference) {
      const cand = await client.query(
        `SELECT id::text AS id, external_ref, merchant_reference, status, amount_minor, currency, metadata,
                settlement_status, job_id, created_at
         FROM gateway_transactions
         WHERE COALESCE(job_id::text, '') = $1
           AND metadata @> $2::jsonb
         ORDER BY id ASC
         LIMIT 50`,
        [jobId, corrSuperset],
      );
      for (const row of cand.rows) {
        const nr = normalizeGwRow(row);
        const ux = await buildUxPayloadForGatewayRow(pool, nr, {
          displayAmount: String(amountThb),
          traceId,
        });
        if (UX_REUSABLE_STATUSES.has(ux.status)) {
          await dualWriteEnsureCanonicalMatchJobMirror(client, {
            gwRow: nr,
            employerId,
            job,
            amountThb,
            normalizedClientReference,
            traceId,
            paymentChannel,
          });
          await client.query('COMMIT');
          return { reused: true, gwRow: nr, ux };
        }
      }
    }

    const ext = publicPaymentExternalRef();
    const amtMinor = Math.max(0, Math.round(Number(amountThb) * 100));
    const ins = await insertGatewayRow(client, {
      externalRef: ext,
      jobId,
      employerId,
      amountMinor: amtMinor,
      metaObj,
    });
    const nins = normalizeGwRow(ins);
    await dualWriteEnsureCanonicalMatchJobMirror(client, {
      gwRow: nins,
      employerId,
      job,
      amountThb,
      normalizedClientReference,
      traceId,
      paymentChannel,
    });
    await client.query('COMMIT');
    const uxFresh = await buildUxPayloadForGatewayRow(pool, nins, {
      displayAmount: String(amountThb),
      traceId,
    });
    return { reused: false, gwRow: nins, ux: uxFresh };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
