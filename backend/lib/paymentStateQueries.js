/**
 * Task 14: Read-only loaders for payment state projection evidence.
 * All reads use deterministic ORDER BY `{table}.id` (never created_at).
 */

import { getTableColumnNames, regclassExists } from './jobBookingCheckoutSideEffects.js';

/**
 * @typedef {{ id: string|number, event_type: string, amount_minor?: number|null }} LedgerEvidenceRow
 * @typedef {{ id: string|number, status: string, amount_minor: number|null, settlement_status?: string|null }} GatewayEvidenceRow
 * @typedef {{ id: string|number, state: string }} EscrowEvidenceRow
 * @typedef {{ provider: string, event_id: string }} ProcessedWebhookKey
 * @typedef {{ id: string|number, event_name?: string|null }} OutboundEvidenceRow
 */

/** @param {unknown} amt */
function ledgerAmountToMinor(amt) {
  if (amt == null) return null;
  const n = Number(amt);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/** @param {string|null|undefined} id */
function looksLikeUuid(id) {
  const s = String(id || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

/**
 * Loads normalized evidence rows for projection (no INSERT/UPDATE/DELETE).
 *
 * @param {import('pg').Pool|import('pg').PoolClient} client
 * @param {{
 *   payment_id: string,
 *   gateway_transaction_id?: string|null,
 *   client_reference_id?: string|null,
 *   processed_webhooks?: readonly ProcessedWebhookKey[] | null,
 *   provider_paid_evidence?: boolean,
 *   provider_available?: boolean,
 *   provider_amount_minor?: number|null,
 *   duplicate_provider_events?: boolean,
 * }} opts
 */
export async function loadPaymentProjectionEvidence(client, opts) {
  const paymentId = String(opts?.payment_id || '').trim();
  if (!paymentId) {
    const empty = emptyEvidenceSkeleton('');
    empty.errors.push('missing_payment_id');
    return empty;
  }

  /** @type {LedgerEvidenceRow[]} */
  let ledger_rows = [];
  if (await regclassExists(client, 'public.ledger_entries')) {
    const lr = await client.query(
      `SELECT id::text AS id, event_type, amount::numeric AS amount
       FROM ledger_entries
       WHERE payment_id = $1
       ORDER BY id ASC`,
      [paymentId],
    );
    ledger_rows = (lr.rows || []).map((row) => ({
      id: row.id,
      event_type: String(row.event_type || ''),
      amount_minor: ledgerAmountToMinor(row.amount),
    }));
  }

  /** @type {GatewayEvidenceRow|null} */
  let gateway_row = null;
  const gwUuid = opts?.gateway_transaction_id != null ? String(opts.gateway_transaction_id).trim() : '';
  const clientRef = opts?.client_reference_id != null ? String(opts.client_reference_id).trim() : '';

  if (await regclassExists(client, 'public.gateway_transactions')) {
    const gCols = await getTableColumnNames(client, 'gateway_transactions');
    const selectCols = ['id::text AS id', 'status', 'amount_minor'];
    if (gCols.has('settlement_status')) selectCols.push('settlement_status');

    const clauses = [];
    /** @type {unknown[]} */
    const vals = [];
    let p = 1;

    if (looksLikeUuid(gwUuid)) {
      clauses.push(`id = $${p}::uuid`);
      vals.push(gwUuid);
      p += 1;
    }
    clauses.push(`external_ref = $${p}`);
    vals.push(paymentId);
    p += 1;
    clauses.push(`merchant_reference = $${p}`);
    vals.push(paymentId);
    p += 1;
    if (clientRef && gCols.has('client_reference_id')) {
      clauses.push(`client_reference_id = $${p}`);
      vals.push(clientRef);
      p += 1;
    }

    const sql = `SELECT ${selectCols.join(', ')}
      FROM gateway_transactions
      WHERE (${clauses.join(' OR ')})
      ORDER BY id DESC
      LIMIT 1`;
    const gr = await client.query(sql, vals);
    const g = gr.rows?.[0];
    if (g) {
      gateway_row = {
        id: String(g.id),
        status: String(g.status || ''),
        amount_minor: g.amount_minor != null ? Math.round(Number(g.amount_minor)) : null,
        settlement_status: g.settlement_status != null ? String(g.settlement_status) : null,
      };
    }
  }

  /** @type {EscrowEvidenceRow[]} */
  let escrow_events = [];
  if (await regclassExists(client, 'public.payment_escrow_events')) {
    const er = await client.query(
      `SELECT id::text AS id, state
       FROM payment_escrow_events
       WHERE payment_id = $1
       ORDER BY id ASC`,
      [paymentId],
    );
    escrow_events = (er.rows || []).map((row) => ({
      id: row.id,
      state: String(row.state || ''),
    }));
  }

  /** @type {ProcessedWebhookKey[]} */
  const processed_webhook_keys = [];
  const webhookList = [...(opts?.processed_webhooks || [])].sort((a, b) => {
    const dp = String(a.provider || '').localeCompare(String(b.provider || ''));
    if (dp) return dp;
    return String(a.event_id || '').localeCompare(String(b.event_id || ''));
  });

  let seenWebhook = new Set();
  if (webhookList.length && (await regclassExists(client, 'public.processed_webhook_events'))) {
    for (const w of webhookList) {
      const prov = String(w.provider || '').toLowerCase().trim();
      const eid = String(w.event_id || '').trim();
      if (!prov || !eid) continue;
      const probe = `${prov}\t${eid}`;
      if (seenWebhook.has(probe)) continue;
      seenWebhook.add(probe);
      const r = await client.query(
        `SELECT 1 FROM processed_webhook_events WHERE provider = $1 AND event_id = $2 LIMIT 1`,
        [prov, eid],
      );
      if (r.rows?.length) processed_webhook_keys.push({ provider: prov, event_id: eid });
    }
  }

  /** @type {OutboundEvidenceRow[]} */
  let outbound_events = [];
  if (await regclassExists(client, 'public.outbound_domain_events')) {
    const oCols = await getTableColumnNames(client, 'outbound_domain_events');
    if (oCols.has('payment_id')) {
      const or = await client.query(
        `SELECT id::text AS id, event_name
         FROM outbound_domain_events
         WHERE payment_id = $1
         ORDER BY id ASC`,
        [paymentId],
      );
      outbound_events = (or.rows || []).map((row) => ({
        id: String(row.id),
        event_name: row.event_name != null ? String(row.event_name) : null,
      }));
    }
  }

  return {
    payment_id: paymentId,
    ledger_rows,
    gateway_row,
    escrow_events,
    processed_webhook_keys,
    outbound_events,
    provider_paid_evidence: opts?.provider_paid_evidence === true,
    provider_available: opts?.provider_available !== false,
    provider_amount_minor:
      opts?.provider_amount_minor != null ? Math.round(Number(opts.provider_amount_minor)) : null,
    duplicate_provider_events: opts?.duplicate_provider_events === true,
    errors: [],
  };
}

function emptyEvidenceSkeleton(payment_id) {
  return {
    payment_id,
    ledger_rows: [],
    gateway_row: null,
    escrow_events: [],
    processed_webhook_keys: [],
    outbound_events: [],
    provider_paid_evidence: false,
    provider_available: true,
    provider_amount_minor: null,
    duplicate_provider_events: false,
    errors: [],
  };
}
