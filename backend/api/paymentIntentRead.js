/**
 * Task 19F — Intent API shell (read-through only).
 * GET snapshot: canonical skeleton + projection + optional UX presenter.
 * No writes, no settlement, no webhook side effects.
 */

import { fetchPaymentByIdSkeleton } from '../lib/paymentIntentRepository.js';
import { loadPaymentProjectionEvidence } from '../lib/paymentStateQueries.js';
import { projectPaymentStateFromDb } from '../lib/paymentStateProjection.js';
import { loadCanonicalBundleByGatewayTxId } from '../lib/paymentCanonicalShadow.js';
import { presentUxPaymentFromProjection, presentUxImmediateCompleted } from '../lib/paymentResponsePresenter.js';
import { getControlledReadTelemetry, getCanonicalShadowScratch } from '../lib/paymentCanonicalShadow.js';
import {
  getControlledReadProgram,
  getIntentCutoverPhaseLabel,
  isIntentCutoverReadsEnabled,
} from '../lib/paymentIntentCutover.js';

const INTENT_SNAPSHOT_SCHEMA_VERSION = 1;

/** @param {string|null|undefined} id */
export function looksLikePaymentIntentUuid(id) {
  const s = String(id || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

/**
 * Bounded canonical snapshot for API (no raw metadata blob).
 * @param {{ payment?: object, attempts?: object[], transitions?: object[] }|null} bundle
 */
export function summarizeCanonicalBundleForIntentApi(bundle) {
  if (!bundle?.payment) return null;
  const p = bundle.payment;
  return {
    payment: {
      id: String(p.id),
      status: String(p.status || ''),
      amount_minor: p.amount_minor != null && Number.isFinite(Number(p.amount_minor)) ? Math.round(Number(p.amount_minor)) : null,
      reference_id: p.reference_id != null ? String(p.reference_id) : null,
      active_attempt_id: p.active_attempt_id != null ? String(p.active_attempt_id) : null,
    },
    attempts: (bundle.attempts || []).map((a) => ({
      id: String(a.id),
      gateway_transaction_id: a.gateway_transaction_id != null ? String(a.gateway_transaction_id) : null,
    })),
    transition_count: (bundle.transitions || []).length,
  };
}

/**
 * Resolve job id (ledger payment_id), optional canonical payment id, gateway tx id for match-job checkout.
 * @param {import('pg').Pool} pool
 * @param {string} rawId — canonical `payments.id` OR match `jobs.id`
 */
export async function resolvePaymentIntentReadContext(pool, rawId) {
  const sid = String(rawId || '').trim();
  if (!sid) return { ok: false, code: 'missing_id' };

  let ledgerPaymentId = '';
  /** @type {string|null} */
  let canonicalPaymentId = null;
  /** @type {string|null} */
  let gatewayTransactionId = null;

  if (looksLikePaymentIntentUuid(sid)) {
    const pay = await fetchPaymentByIdSkeleton(pool, sid);
    if (pay) {
      canonicalPaymentId = String(pay.id);
      ledgerPaymentId = String(pay.reference_id || '').trim();
      if (!ledgerPaymentId) return { ok: false, code: 'not_found' };
      const a = await pool
        .query(
          `SELECT gateway_transaction_id::text AS gw FROM payment_attempts WHERE payment_id = $1::uuid ORDER BY id ASC LIMIT 1`,
          [canonicalPaymentId],
        )
        .catch(() => ({ rows: [] }));
      gatewayTransactionId = a.rows[0]?.gw ? String(a.rows[0].gw) : null;
    }
  }

  if (!ledgerPaymentId) {
    const jr = await pool
      .query(`SELECT id::text, created_by::text, accepted_by::text FROM jobs WHERE id::text = $1 LIMIT 1`, [sid])
      .catch((e) => {
        if (e?.code === '22P02') return { rows: [] };
        throw e;
      });
    const row = jr.rows?.[0];
    if (!row) return { ok: false, code: 'not_found' };
    ledgerPaymentId = String(row.id);
    const pr = await pool
      .query(
        `SELECT id::text FROM payments
         WHERE reference_id = $1::uuid AND purpose = $2
         ORDER BY id ASC
         LIMIT 1`,
        [ledgerPaymentId, 'job_checkout'],
      )
      .catch(() => ({ rows: [] }));
    if (pr.rows?.[0]?.id) {
      canonicalPaymentId = String(pr.rows[0].id);
      const a = await pool
        .query(
          `SELECT gateway_transaction_id::text AS gw FROM payment_attempts WHERE payment_id = $1::uuid ORDER BY id ASC LIMIT 1`,
          [canonicalPaymentId],
        )
        .catch(() => ({ rows: [] }));
      gatewayTransactionId = a.rows[0]?.gw ? String(a.rows[0].gw) : null;
    }
  }

  if (!ledgerPaymentId) return { ok: false, code: 'not_found' };

  const jobr = await pool.query(
    `SELECT id::text, created_by::text, accepted_by::text, payment_status, payment_details, price, status FROM jobs WHERE id::text = $1 LIMIT 1`,
    [ledgerPaymentId],
  );
  const job = jobr.rows?.[0] || null;
  if (!job) return { ok: false, code: 'not_found' };

  if (!gatewayTransactionId) {
    const ev = await loadPaymentProjectionEvidence(pool, {
      payment_id: ledgerPaymentId,
    });
    gatewayTransactionId = ev.gateway_row?.id ? String(ev.gateway_row.id) : null;
  }

  return {
    ok: true,
    job,
    ledger_payment_id: ledgerPaymentId,
    canonical_payment_id: canonicalPaymentId,
    gateway_transaction_id: gatewayTransactionId,
  };
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} userId
 * @param {string} rawId
 */
export async function buildPaymentIntentSnapshot(pool, userId, rawId) {
  const ctx = await resolvePaymentIntentReadContext(pool, rawId);
  if (!ctx.ok) {
    const status = ctx.code === 'missing_id' ? 400 : 404;
    return {
      status,
      body: { success: false, _schema_version: INTENT_SNAPSHOT_SCHEMA_VERSION, error: ctx.code },
    };
  }

  const uid = String(userId || '').trim();
  const emp = String(ctx.job.created_by || '').trim();
  const prov = String(ctx.job.accepted_by || '').trim();
  if (uid !== emp && uid !== prov) {
    return {
      status: 403,
      body: { success: false, _schema_version: INTENT_SNAPSHOT_SCHEMA_VERSION, error: 'forbidden' },
    };
  }

  const pd =
    typeof ctx.job.payment_details === 'string' ? JSON.parse(ctx.job.payment_details || '{}') : ctx.job.payment_details || {};
  const displayAmt = pd.amount != null ? pd.amount : ctx.job.price;
  const qrExp = pd.qr_expires_at || pd.qr_expires || pd.expires_at || pd.payment_qr_expires_at || null;

  const projOpts = {
    payment_id: ctx.ledger_payment_id,
    ...(ctx.gateway_transaction_id ? { gateway_transaction_id: ctx.gateway_transaction_id } : {}),
  };
  const proj = await projectPaymentStateFromDb(pool, projOpts).catch(() => null);

  /** @type {unknown} */
  let canonical = null;
  if (ctx.gateway_transaction_id) {
    try {
      const bundle = await loadCanonicalBundleByGatewayTxId(pool, ctx.gateway_transaction_id);
      canonical = summarizeCanonicalBundleForIntentApi(bundle);
    } catch {
      canonical = null;
    }
  }

  let ux;
  if (
    String(ctx.job.payment_status || '').toLowerCase() === 'paid' &&
    String(ctx.job.status || '').toLowerCase() === 'completed'
  ) {
    ux = presentUxImmediateCompleted(ctx.ledger_payment_id, displayAmt, `intent_snapshot:${ctx.ledger_payment_id}`);
  } else {
    ux = presentUxPaymentFromProjection(
      proj || { payment_id: ctx.ledger_payment_id, projection_state: 'PAYMENT_PENDING', reason_codes: [], gateway_status: null },
      {
        trace_id: `intent_snapshot:${ctx.ledger_payment_id}`,
        display_amount: displayAmt != null ? String(displayAmt) : '',
        expires_at: qrExp != null ? String(qrExp) : null,
        awaiting_user_hint: !!(pd.awaiting_payment === true || pd.qr_pending === true || pd.promptpay_pending === true),
        open_qr:
          !!(pd.payment_qr_url || pd.qr_code_url || pd.qr_payload) &&
          String(ctx.job.payment_status || '').toLowerCase() !== 'paid',
      },
    );
  }

  const tel = getControlledReadTelemetry();
  const shScratch = getCanonicalShadowScratch();

  return {
    status: 200,
    body: {
      success: true,
      _schema_version: INTENT_SNAPSHOT_SCHEMA_VERSION,
      payment_id: ctx.canonical_payment_id,
      gateway_transaction_id: ctx.gateway_transaction_id,
      ledger_payment_id: ctx.ledger_payment_id,
      projection: proj
        ? {
            payment_id: proj.payment_id,
            projection_state: proj.projection_state,
            manual_review_required: proj.manual_review_required,
            reason_codes: [...(proj.reason_codes || [])],
            gateway_status: proj.gateway_status ?? null,
            gateway_settlement_status: proj.gateway_settlement_status ?? null,
          }
        : null,
      canonical,
      ux,
      telemetry: {
        controlled_read_lane: tel.lane ?? null,
        read_program: getControlledReadProgram(),
        intent_cutover_reads: isIntentCutoverReadsEnabled(),
        intent_cutover_phase: getIntentCutoverPhaseLabel(),
        canonical_shadow_projection: shScratch.projection ? { classification: shScratch.projection.classification } : null,
      },
    },
  };
}

/**
 * Express handler — read-only.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('pg').Pool|null|undefined} pool
 */
export async function handlePaymentIntentSnapshotGet(req, res, pool) {
  if (!pool) return res.status(503).json({ success: false, _schema_version: INTENT_SNAPSHOT_SCHEMA_VERSION, error: 'server_not_ready' });
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, _schema_version: INTENT_SNAPSHOT_SCHEMA_VERSION, error: 'unauthorized' });

  const rawId = String(req.params.id || '').trim();
  const out = await buildPaymentIntentSnapshot(pool, userId, rawId);
  return res.status(out.status).json(out.body);
}
