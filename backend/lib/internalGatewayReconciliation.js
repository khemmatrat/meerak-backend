/**
 * Self-healing settlement: compare Jobs (front) vs gateway_transactions (back) 1:1 in minor units.
 */
import { sendLineNotify } from './alertNotifier.js';
import { regclassExists, getTableColumnNames } from './jobBookingCheckoutSideEffects.js';
import {
  classifyPaymentCoreReconciliation,
  mergeDuplicateProviderEvents,
  toMinorInt,
} from './paymentReconciliationActions.js';

function jobAmountToMinor(paymentDetails) {
  const pd =
    typeof paymentDetails === 'string' ? JSON.parse(paymentDetails || '{}') : paymentDetails || {};
  const raw = pd.amount ?? pd.total ?? pd.finalPrice ?? 0;
  const thb = Number(raw);
  if (!Number.isFinite(thb)) return null;
  return Math.round(thb * 100);
}

/**
 * @param {import('pg').Pool} pool
 */
export async function runNightlyGatewayReconciliation(pool) {
  let mismatches = [];
  let checked = 0;
  try {
    const r = await pool.query(
      `SELECT id, job_id, amount_minor, status, metadata, locked_for_recon
       FROM gateway_transactions
       WHERE (job_id IS NOT NULL OR COALESCE(metadata->>'job_id','') <> '')
         AND status NOT IN ('FAILED', 'VOIDED', 'REFUNDED')`
    );
    for (const row of r.rows || []) {
      const jid = row.job_id || row.metadata?.job_id;
      if (!jid) continue;
      checked += 1;
      const job = await pool
        .query(`SELECT id, payment_status, payment_details FROM jobs WHERE id::text = $1 LIMIT 1`, [String(jid)])
        .catch(() => ({ rows: [] }));
      const j = job.rows?.[0];
      if (!j) {
        mismatches.push({ gatewayId: row.id, jobId: jid, issue: 'job_missing' });
        await pool
          .query(
            `UPDATE gateway_transactions SET locked_for_recon = TRUE, recon_alert_at = COALESCE(recon_alert_at, NOW()),
             metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb WHERE id = $1::uuid`,
            [row.id, JSON.stringify({ recon_issue: 'job_missing' })]
          )
          .catch(() => {});
        continue;
      }
      if (String(j.payment_status || '').toLowerCase() !== 'paid') continue;
      const jobMinor = jobAmountToMinor(j.payment_details);
      if (jobMinor == null) continue;
      const delta = Math.abs(jobMinor - Number(row.amount_minor || 0));
      if (delta > 0) {
        mismatches.push({
          gatewayId: row.id,
          jobId: jid,
          jobMinor,
          gatewayMinor: Number(row.amount_minor),
          deltaMinor: delta,
        });
        await pool.query(
          `UPDATE gateway_transactions
           SET locked_for_recon = TRUE,
               recon_alert_at = COALESCE(recon_alert_at, NOW()),
               metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
           WHERE id = $1::uuid`,
          [row.id, JSON.stringify({ recon_delta_minor: delta, recon_checked_at: new Date().toISOString() })]
        );
      }
    }

    const matched = Math.max(0, checked - mismatches.length);
    await pool.query(
      `INSERT INTO gateway_reconciliation_runs (matched_count, mismatch_count, locked_count, details_json)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [
        matched,
        mismatches.length,
        mismatches.length,
        JSON.stringify({ mismatches: mismatches.slice(0, 500) }),
      ]
    );

    if (mismatches.length > 0) {
      const msg =
        `🚨 [AQOND] Gateway Reconcile — พบความต่าง Job vs Gateway จำนวน ${mismatches.length} รายการ (ล็อกธุรกรรมแล้ว)\n` +
        mismatches
          .slice(0, 5)
          .map((m) => `· ${m.jobId} Δ ${m.deltaMinor != null ? m.deltaMinor + ' สต.' : m.issue}`)
          .join('\n');
      await sendLineNotify(msg).catch(() => {});
    }

    return { ok: true, checked, mismatches: mismatches.length };
  } catch (e) {
    if (e && e.code === '42P01')     return { ok: false, error: 'tables_missing' };
    throw e;
  }
}

// =============================================================================
// Task 13: Payment Core — read-only reconciliation evidence + action lines.
// No mutations, no enqueue. Ledger ordering uses ledger_entries.id only.
// =============================================================================

function trimStr(v) {
  const s = v == null ? '' : String(v);
  return s.trim();
}

/** @param {string|null|undefined} id */
function looksLikeUuid(id) {
  const s = trimStr(id);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

/**
 * @param {unknown} amountThb
 */
function thbNumericToMinor(amountThb) {
  if (amountThb == null) return null;
  const n = Number(amountThb);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/**
 * Read-only webhook / business processing markers (not payment_webhook_jobs).
 * @param {import('pg').Pool|import('pg').PoolClient} client
 * @param {{ provider?: string|null, event_id?: string|null, payment_id?: string|null }} opts
 */
async function readWebhookProcessingEvidence(client, opts) {
  const prov = trimStr(opts.provider).toLowerCase() || null;
  const eventId = trimStr(opts.event_id) || null;
  const paymentId = trimStr(opts.payment_id) || null;

  if (prov && eventId) {
    if (await regclassExists(client, 'public.processed_webhook_events')) {
      const m = await client.query(
        `SELECT 1 FROM processed_webhook_events WHERE provider = $1 AND event_id = $2 LIMIT 1`,
        [prov, eventId],
      );
      if (m.rows?.length) return true;
    }
    if (await regclassExists(client, 'public.payment_transaction_logs')) {
      const cols = await getTableColumnNames(client, 'payment_transaction_logs');
      if (!cols.has('metadata')) {
        /* skip */
      } else {
        const t = await client.query(
          `SELECT 1
           FROM payment_transaction_logs
           WHERE gateway = $1
             AND COALESCE(metadata->>'webhook_event_id','') = $2
             AND COALESCE(status,'') IN ('paid','completed','success','successful','succeeded')
           LIMIT 1`,
          [prov, eventId],
        );
        if (t.rows?.length) return true;
      }
    }
    if (await regclassExists(client, 'public.payment_ledger_audit')) {
      const plaCols = await getTableColumnNames(client, 'payment_ledger_audit');
      if (plaCols.has('metadata')) {
        const a = await client.query(
          `SELECT 1
           FROM payment_ledger_audit
           WHERE COALESCE(LOWER(gateway),'') = $1
             AND COALESCE(metadata->>'webhook_event_id','') = $2
           LIMIT 1`,
          [prov, eventId],
        );
        if (a.rows?.length) return true;
      }
    }
  }

  if (paymentId && (await regclassExists(client, 'public.payment_ledger_audit'))) {
    const q = await client.query(
      `SELECT 1 FROM payment_ledger_audit
       WHERE payment_id = $1
         AND event_type IN ('payment_completed','escrow_held')
         AND status = 'completed'
       LIMIT 1`,
      [paymentId],
    );
    if (q.rows?.length) return true;
  }

  if (paymentId && (await regclassExists(client, 'public.payment_transaction_logs'))) {
    const cols = await getTableColumnNames(client, 'payment_transaction_logs');
    if (!cols.has('metadata')) return false;
    const t2 = await client.query(
      `SELECT 1 FROM payment_transaction_logs
       WHERE COALESCE(metadata->>'payment_id','') = $1
         AND COALESCE(status,'') IN ('paid','completed','success','successful','succeeded')
       LIMIT 1`,
      [paymentId],
    );
    if (t2.rows?.length) return true;
    const t3 = await client.query(
      `SELECT 1 FROM payment_transaction_logs
       WHERE external_id = $1
         AND COALESCE(status,'') IN ('paid','completed','success','successful','succeeded')
       LIMIT 1`,
      [paymentId],
    );
    if (t3.rows?.length) return true;
  }

  return false;
}

/**
 * @param {object} gatewayRow
 * @param {boolean} hasSettlementColumn
 */
function gatewayRowImpliesInternalFinalized(gatewayRow, hasSettlementColumn) {
  const st = String(gatewayRow?.status || '').toUpperCase();
  if (['CAPTURED', 'SETTLED'].includes(st)) return true;
  if (hasSettlementColumn) {
    const ss = String(gatewayRow?.settlement_status || '').toUpperCase();
    if (['PAYMENT_CONFIRMED', 'ESCROW_HELD', 'ESCROW_RELEASED'].includes(ss)) return true;
  }
  return false;
}

/**
 * @typedef {object} PaymentCoreReconciliationSnapshot
 * @property {boolean} [provider_available]
 * @property {boolean} [provider_data_complete]
 * @property {string|null} [provider_status]
 * @property {number|null} [provider_amount_minor]
 * @property {boolean} [provider_paid_or_captured]
 * @property {boolean} [provider_reversed]
 * @property {boolean} [expects_escrow_hold]
 * @property {string|null} [payment_id]
 * @property {string|null} [gateway_transaction_id]
 * @property {string|null} [client_reference_id]
 * @property {string|null} [provider]
 * @property {string|null} [provider_event_id]
 * @property {readonly { provider_event_id: string, payment_id?: string|null }[]|null} [duplicate_provider_event_rows]
 */

/**
 * Build classifier input from provider snapshot + READ-ONLY DB rows.
 * Throws on SQL errors (no partial assumptions).
 *
 * @param {import('pg').Pool|import('pg').PoolClient} client
 * @param {PaymentCoreReconciliationSnapshot} snap
 */
export async function buildPaymentCoreReconciliationEvidence(client, snap) {
  let duplicate_provider_events = false;
  if (Array.isArray(snap?.duplicate_provider_event_rows) && snap.duplicate_provider_event_rows.length > 1) {
    const merged = mergeDuplicateProviderEvents(snap.duplicate_provider_event_rows);
    duplicate_provider_events = merged.merged_events.length < snap.duplicate_provider_event_rows.length;
  }

  const provider_available = snap?.provider_available !== false;
  let provider_data_complete = snap?.provider_data_complete !== false;

  /** Partial provider payloads must not classify as mismatches (freeze doc §E). */
  if (snap?.provider_paid_or_captured === true) {
    if (snap.provider_amount_minor == null || !trimStr(snap?.provider_status)) {
      provider_data_complete = false;
    }
  }
  const paymentId = trimStr(snap?.payment_id) || null;
  const clientRef = trimStr(snap?.client_reference_id) || null;
  const gwId = trimStr(snap?.gateway_transaction_id) || null;

  let gateway_row_present = false;
  /** @type {string|null} */
  let gateway_status = null;
  /** @type {number|null} */
  let gateway_amount_minor = null;
  /** @type {object|null} */
  let gwRow = null;
  let hasSettlement = false;

  if (await regclassExists(client, 'public.gateway_transactions')) {
    const gCols = await getTableColumnNames(client, 'gateway_transactions');
    hasSettlement = gCols.has('settlement_status');

    const selectCols = [
      'id',
      'status',
      'amount_minor',
      `COALESCE(metadata, '{}'::jsonb) AS metadata`,
    ];
    if (hasSettlement) selectCols.push('settlement_status');
    if (gCols.has('webhook_replay_last_seen_at')) selectCols.push('webhook_replay_last_seen_at');

    /** @type {string[]} */
    const clauses = [];
    /** @type {unknown[]} */
    const vals = [];
    let p = 1;

    if (looksLikeUuid(gwId)) {
      clauses.push(`id = $${p}::uuid`);
      vals.push(gwId);
      p += 1;
    }
    if (paymentId) {
      clauses.push(`external_ref = $${p}`);
      vals.push(paymentId);
      p += 1;
      clauses.push(`merchant_reference = $${p}`);
      vals.push(paymentId);
      p += 1;
    }
    if (clientRef && gCols.has('client_reference_id')) {
      clauses.push(`client_reference_id = $${p}`);
      vals.push(clientRef);
      p += 1;
    }

    if (clauses.length) {
      const sql = `SELECT ${selectCols.join(', ')}
        FROM gateway_transactions
        WHERE (${clauses.join(' OR ')})
        ORDER BY id DESC
        LIMIT 1`;
      const gr = await client.query(sql, vals);
      gwRow = gr.rows?.[0] || null;
      if (gwRow) {
        gateway_row_present = true;
        gateway_status = String(gwRow.status || '');
        gateway_amount_minor = toMinorInt(gwRow.amount_minor);
      }
    }
  }

  /** @type {string[]} */
  let ledger_event_types_ordered_by_id_desc = [];
  /** @type {number|null} */
  let ledger_amount_minor = null;

  if (paymentId && (await regclassExists(client, 'public.ledger_entries'))) {
    const lr = await client.query(
      `SELECT id, event_type, amount
       FROM ledger_entries
       WHERE payment_id = $1
       ORDER BY id DESC`,
      [paymentId],
    );
    const rows = lr.rows || [];
    ledger_event_types_ordered_by_id_desc = rows.map((x) => String(x.event_type || ''));

    const pc = rows.find((x) => String(x.event_type || '') === 'PAYMENT_COMPLETED');
    if (pc) ledger_amount_minor = thbNumericToMinor(pc.amount);
    else if (rows[0]) ledger_amount_minor = thbNumericToMinor(rows[0].amount);
  }

  let webhook_processing_evidence = await readWebhookProcessingEvidence(client, {
    provider: snap?.provider,
    event_id: snap?.provider_event_id,
    payment_id: paymentId,
  });

  if (
    !webhook_processing_evidence &&
    gwRow &&
    gwRow.webhook_replay_last_seen_at != null &&
    String(gwRow.webhook_replay_last_seen_at || '').length > 0
  ) {
    webhook_processing_evidence = true;
  }

  const internal_finalized = gwRow
    ? gatewayRowImpliesInternalFinalized(gwRow, hasSettlement)
    : false;

  return {
    provider_available,
    provider_data_complete,
    provider_paid_or_captured: snap?.provider_paid_or_captured === true,
    provider_status: snap?.provider_status ?? null,
    provider_amount_minor: snap?.provider_amount_minor != null ? toMinorInt(snap.provider_amount_minor) : null,
    provider_reversed: snap?.provider_reversed === true,
    duplicate_provider_events,
    gateway_row_present,
    gateway_status,
    gateway_amount_minor,
    internal_finalized,
    webhook_processing_evidence,
    ledger_event_types_ordered_by_id_desc,
    ledger_amount_minor,
    expects_escrow_hold: snap?.expects_escrow_hold === true,
  };
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} client
 * @param {PaymentCoreReconciliationSnapshot} snap
 */
export async function reconcilePaymentCoreFromSnapshot(client, snap) {
  const ev = await buildPaymentCoreReconciliationEvidence(client, snap);
  return classifyPaymentCoreReconciliation(ev);
}

