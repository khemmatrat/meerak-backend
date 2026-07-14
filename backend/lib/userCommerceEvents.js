/**
 * User commerce event stream — append-only, deduped by source_table+source_id.
 * Sync cron ingests new rows from ledger/jobs/payouts; hot path uses emitCommerceEvent().
 */
import crypto from 'crypto';

const IN_EVENT_TYPES = new Set([
  'wallet_deposit',
  'admin_credit',
  'escrow_released',
  'marine_deposit_released',
  'referral_bonus',
  'escrow_refunded',
]);

const OUT_EVENT_TYPES = new Set([
  'user_payout_withdrawal',
  'admin_debit',
  'payment_created',
  'booking_fee',
  'post_job_fee',
  'penalty_debit',
]);

function num(v, fallback = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function metaObj(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function categoryFromRow(eventType, meta, gateway) {
  const leg = String(meta.leg || '');
  if (meta.sub_category) return String(meta.sub_category);
  if (meta.source_type) return String(meta.source_type);
  if (meta.job_category) return String(meta.job_category);
  if (eventType === 'wallet_deposit') return String(gateway || 'gateway').toLowerCase();
  if (leg === 'provider_net' || leg === 'user_debit') return 'job';
  return eventType || 'general';
}

/**
 * @param {import('pg').Pool} pool
 * @param {{
 *   userId: string,
 *   eventType: string,
 *   category?: string|null,
 *   amount?: number|null,
 *   jobId?: string|null,
 *   sourceTable?: string|null,
 *   sourceId?: string|null,
 *   metadata?: object,
 *   eventAt?: Date|string|null,
 * }} evt
 */
export async function emitCommerceEvent(pool, evt) {
  const userId = String(evt.userId || '').trim();
  const eventType = String(evt.eventType || '').trim();
  if (!userId || !eventType) return { ok: false, reason: 'missing_fields' };

  const sourceTable = evt.sourceTable ? String(evt.sourceTable) : null;
  const sourceId = evt.sourceId ? String(evt.sourceId) : null;

  try {
    await pool.query(
      `INSERT INTO user_commerce_events
         (user_id, event_type, category, amount, job_id, source_table, source_id, metadata, event_at)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8::jsonb, COALESCE($9::timestamptz, NOW()))
       ON CONFLICT (source_table, source_id) WHERE source_table IS NOT NULL AND source_id IS NOT NULL
       DO NOTHING`,
      [
        userId,
        eventType,
        evt.category || null,
        evt.amount != null ? num(evt.amount, 0) : null,
        evt.jobId ? String(evt.jobId) : null,
        sourceTable,
        sourceId,
        JSON.stringify(evt.metadata || {}),
        evt.eventAt || null,
      ],
    );
    if (process.env.AIVOS_JARVIS_PROACTIVE === '1') {
      void import('./jarvis/jarvisEventBridge.js')
        .then((m) => m.ingestJarvisCommerceEvent(pool, userId, eventType, evt.metadata || {}))
        .catch(() => {});
    }
    return { ok: true };
  } catch (e) {
    if (String(e?.code) === '42P01') return { ok: false, reason: 'table_missing' };
    console.warn('[commerce-events] emit failed:', e?.message);
    return { ok: false, reason: e?.message };
  }
}

function ledgerRowToEvent(row) {
  const meta = metaObj(row.metadata);
  const leg = String(meta.leg || '');
  const eventType = String(row.event_type || '');
  let userId = row.user_id ? String(row.user_id) : null;
  if (!userId && row.provider_id) userId = String(row.provider_id);
  if (!userId) return null;

  if (eventType === 'escrow_held' && !['provider_net', 'coach_training_fee', 'user_debit'].includes(leg)) {
    if (leg !== 'user_debit') return null;
  }

  const amount = num(row.net_amount ?? row.amount, 0);
  return {
    userId,
    eventType,
    category: categoryFromRow(eventType, meta, row.gateway),
    amount,
    jobId: row.job_id ? String(row.job_id) : null,
    sourceTable: 'payment_ledger_audit',
    sourceId: String(row.id),
    metadata: { leg, gateway: row.gateway, status: row.status },
    eventAt: row.created_at,
  };
}

/** Hot-path: emit from payment_ledger_audit row id (text PK). */
export async function emitCommerceFromLedgerId(pool, ledgerId) {
  const id = String(ledgerId || '').trim();
  if (!id) return { ok: false, reason: 'missing_id' };
  const r = await pool.query(
    `SELECT id, event_type, payment_id, gateway, job_id, amount, net_amount, status, metadata,
            created_at, user_id, provider_id
     FROM payment_ledger_audit WHERE id = $1`,
    [id],
  ).catch(() => ({ rows: [] }));
  if (!r.rows?.[0]) return { ok: false, reason: 'not_found' };
  const evt = ledgerRowToEvent(r.rows[0]);
  if (!evt) return { ok: false, reason: 'skipped' };
  return emitCommerceEvent(pool, evt);
}

/** Fire-and-forget hot-path hook (after COMMIT). */
export function scheduleCommerceEmitFromLedger(pool, ledgerId) {
  if (!ledgerId) return;
  setImmediate(() => {
    void emitCommerceFromLedgerId(pool, ledgerId).catch(() => { });
  });
}

/** Emit recent ledger rows for a job (payment accept / refund). */
export async function emitCommerceForJobLedgers(pool, jobId) {
  const jid = String(jobId || '').trim();
  if (!jid) return { emitted: 0 };
  const r = await pool.query(
    `SELECT id FROM payment_ledger_audit
     WHERE job_id::text = $1
       AND event_type IN ('payment_created', 'escrow_held', 'escrow_released', 'escrow_refunded')
       AND created_at > NOW() - INTERVAL '10 minutes'
     ORDER BY created_at ASC`,
    [jid],
  ).catch(() => ({ rows: [] }));
  let emitted = 0;
  for (const row of r.rows || []) {
    const res = await emitCommerceFromLedgerId(pool, row.id);
    if (res.ok) emitted += 1;
  }
  return { emitted };
}

export function scheduleCommerceEmitForJob(pool, jobId) {
  if (!jobId) return;
  setImmediate(() => {
    void emitCommerceForJobLedgers(pool, jobId).catch(() => { });
  });
}

/**
 * Incremental sync from payment_ledger_audit (safety net + backfill).
 */
export async function syncLedgerCommerceEvents(pool, { batchSize = 500 } = {}) {
  const stateRes = await pool.query(
    `SELECT last_synced_at FROM commerce_sync_state WHERE key = 'ledger_sync'`,
  ).catch(() => ({ rows: [] }));
  const since = stateRes.rows?.[0]?.last_synced_at || new Date(Date.now() - 90 * 86400000);
  let maxTs = since;

  const rows = await pool.query(
    `SELECT id, event_type, payment_id, gateway, job_id, amount, net_amount, status, metadata,
            created_at, user_id, provider_id
     FROM payment_ledger_audit
     WHERE created_at > $1::timestamptz
     ORDER BY created_at ASC
     LIMIT $2`,
    [since, batchSize],
  ).catch(() => ({ rows: [] }));

  let inserted = 0;
  for (const row of rows.rows || []) {
    const evt = ledgerRowToEvent(row);
    if (!evt) continue;
    const r = await emitCommerceEvent(pool, evt);
    if (r.ok) inserted += 1;
    if (row.created_at && new Date(row.created_at) > new Date(maxTs)) maxTs = row.created_at;
  }

  if ((rows.rows || []).length > 0) {
    await pool.query(
      `INSERT INTO commerce_sync_state (key, last_synced_at, updated_at)
       VALUES ('ledger_sync', $1::timestamptz, NOW())
       ON CONFLICT (key) DO UPDATE SET last_synced_at = EXCLUDED.last_synced_at, updated_at = NOW()`,
      [maxTs],
    ).catch(() => { });
  }

  return { scanned: (rows.rows || []).length, emitted: inserted, watermark: maxTs };
}

async function syncJobsCommerceEvents(pool, { batchSize = 200 } = {}) {
  const stateRes = await pool.query(
    `SELECT last_synced_at FROM commerce_sync_state WHERE key = 'jobs_sync'`,
  ).catch(() => ({ rows: [] }));
  const since = stateRes.rows?.[0]?.last_synced_at || new Date(Date.now() - 90 * 86400000);
  let maxTs = since;

  const rows = await pool.query(
    `SELECT id::text AS id, created_by, accepted_by, status, category,
            COALESCE(budget_amount, price) AS budget, updated_at, created_at
     FROM jobs
     WHERE GREATEST(created_at, COALESCE(updated_at, created_at)) > $1::timestamptz
     ORDER BY GREATEST(created_at, COALESCE(updated_at, created_at)) ASC
     LIMIT $2`,
    [since, batchSize],
  ).catch(() => ({ rows: [] }));

  let emitted = 0;
  for (const row of rows.rows || []) {
    const userId = row.created_by ? String(row.created_by) : null;
    if (!userId) continue;
    const ts = row.updated_at || row.created_at;
    const cat = row.category ? String(row.category) : 'job';

    const postEvt = {
      userId,
      eventType: 'job_posted',
      category: cat,
      amount: num(row.budget, 0) || null,
      jobId: row.id,
      sourceTable: 'jobs',
      sourceId: `${row.id}:posted`,
      metadata: { status: row.status },
      eventAt: row.created_at,
    };
    if ((await emitCommerceEvent(pool, postEvt)).ok) emitted += 1;

    if (row.accepted_by) {
      const acceptTs = row.updated_at || row.created_at;
      const acceptClient = {
        userId,
        eventType: 'job_accepted',
        category: cat,
        jobId: row.id,
        sourceTable: 'jobs',
        sourceId: `${row.id}:accepted:client`,
        metadata: { provider_id: String(row.accepted_by), status: row.status },
        eventAt: acceptTs,
      };
      const acceptProvider = {
        userId: String(row.accepted_by),
        eventType: 'job_accepted',
        category: cat,
        jobId: row.id,
        sourceTable: 'jobs',
        sourceId: `${row.id}:accepted:provider`,
        metadata: { client_id: userId, status: row.status },
        eventAt: acceptTs,
      };
      if ((await emitCommerceEvent(pool, acceptClient)).ok) emitted += 1;
      if ((await emitCommerceEvent(pool, acceptProvider)).ok) emitted += 1;
    }

    const st = String(row.status || '').toLowerCase();
    if (st === 'completed') {
      const doneEvt = {
        userId,
        eventType: 'job_completed',
        category: cat,
        amount: num(row.budget, 0) || null,
        jobId: row.id,
        sourceTable: 'jobs',
        sourceId: `${row.id}:completed`,
        metadata: { status: row.status },
        eventAt: ts,
      };
      if ((await emitCommerceEvent(pool, doneEvt)).ok) emitted += 1;
    }
    if (st === 'disputed' || st === 'cancelled') {
      const dispEvt = {
        userId,
        eventType: 'job_disputed',
        category: cat,
        jobId: row.id,
        sourceTable: 'jobs',
        sourceId: `${row.id}:${st}`,
        metadata: { status: row.status },
        eventAt: ts,
      };
      if ((await emitCommerceEvent(pool, dispEvt)).ok) emitted += 1;
    }
    if (ts && new Date(ts) > new Date(maxTs)) maxTs = ts;
  }

  if ((rows.rows || []).length > 0) {
    await pool.query(
      `INSERT INTO commerce_sync_state (key, last_synced_at, updated_at)
       VALUES ('jobs_sync', $1::timestamptz, NOW())
       ON CONFLICT (key) DO UPDATE SET last_synced_at = EXCLUDED.last_synced_at, updated_at = NOW()`,
      [maxTs],
    ).catch(() => { });
  }

  return { scanned: (rows.rows || []).length, emitted, watermark: maxTs };
}

async function syncJobBidsCommerceEvents(pool, { batchSize = 200 } = {}) {
  const stateRes = await pool.query(
    `SELECT last_synced_at FROM commerce_sync_state WHERE key = 'bids_sync'`,
  ).catch(() => ({ rows: [] }));
  const since = stateRes.rows?.[0]?.last_synced_at || new Date(Date.now() - 90 * 86400000);
  let maxTs = since;

  const rows = await pool.query(
    `SELECT b.id::text AS id, b.job_id::text AS job_id, b.provider_id, b.status,
            b.proposed_job_fee_thb, b.created_at, b.updated_at, j.created_by, j.category
     FROM job_bids b
     JOIN jobs j ON j.id = b.job_id
     WHERE GREATEST(b.created_at, COALESCE(b.updated_at, b.created_at)) > $1::timestamptz
     ORDER BY GREATEST(b.created_at, COALESCE(b.updated_at, b.created_at)) ASC
     LIMIT $2`,
    [since, batchSize],
  ).catch(() => ({ rows: [] }));

  let emitted = 0;
  for (const row of rows.rows || []) {
    const ts = row.updated_at || row.created_at;
    const cat = row.category ? String(row.category) : 'job';
    const bidEvt = {
      userId: String(row.provider_id),
      eventType: 'job_bid',
      category: cat,
      amount: num(row.proposed_job_fee_thb, 0) || null,
      jobId: row.job_id,
      sourceTable: 'job_bids',
      sourceId: `${row.id}:bid`,
      metadata: { status: row.status, client_id: row.created_by ? String(row.created_by) : null },
      eventAt: row.created_at,
    };
    if ((await emitCommerceEvent(pool, bidEvt)).ok) emitted += 1;

    if (String(row.status || '').toLowerCase() === 'accepted') {
      const acceptEvt = {
        userId: String(row.provider_id),
        eventType: 'job_bid_accepted',
        category: cat,
        amount: num(row.proposed_job_fee_thb, 0) || null,
        jobId: row.job_id,
        sourceTable: 'job_bids',
        sourceId: `${row.id}:accepted`,
        metadata: { status: row.status },
        eventAt: ts,
      };
      if ((await emitCommerceEvent(pool, acceptEvt)).ok) emitted += 1;
      if (row.created_by) {
        const clientEvt = {
          userId: String(row.created_by),
          eventType: 'job_bid_accepted',
          category: cat,
          jobId: row.job_id,
          sourceTable: 'job_bids',
          sourceId: `${row.id}:accepted:client`,
          metadata: { provider_id: String(row.provider_id), status: row.status },
          eventAt: ts,
        };
        if ((await emitCommerceEvent(pool, clientEvt)).ok) emitted += 1;
      }
    }
    if (ts && new Date(ts) > new Date(maxTs)) maxTs = ts;
  }

  if ((rows.rows || []).length > 0) {
    await pool.query(
      `INSERT INTO commerce_sync_state (key, last_synced_at, updated_at)
       VALUES ('bids_sync', $1::timestamptz, NOW())
       ON CONFLICT (key) DO UPDATE SET last_synced_at = EXCLUDED.last_synced_at, updated_at = NOW()`,
      [maxTs],
    ).catch(() => { });
  }

  return { scanned: (rows.rows || []).length, emitted, watermark: maxTs };
}

async function syncJobReviewsCommerceEvents(pool, { batchSize = 200 } = {}) {
  const stateRes = await pool.query(
    `SELECT last_synced_at FROM commerce_sync_state WHERE key = 'reviews_sync'`,
  ).catch(() => ({ rows: [] }));
  const since = stateRes.rows?.[0]?.last_synced_at || new Date(Date.now() - 90 * 86400000);
  let maxTs = since;

  const rows = await pool.query(
    `SELECT id::text AS id, job_id::text AS job_id, reviewer_id, reviewee_id, rating, created_at
     FROM job_reviews
     WHERE created_at > $1::timestamptz
     ORDER BY created_at ASC
     LIMIT $2`,
    [since, batchSize],
  ).catch(() => ({ rows: [] }));

  let emitted = 0;
  for (const row of rows.rows || []) {
    for (const uid of [row.reviewer_id, row.reviewee_id]) {
      if (!uid) continue;
      const evt = {
        userId: String(uid),
        eventType: 'job_review',
        category: 'review',
        amount: row.rating != null ? num(row.rating) : null,
        jobId: row.job_id,
        sourceTable: 'job_reviews',
        sourceId: `${row.id}:${String(uid)}`,
        metadata: { rating: row.rating, role: String(uid) === String(row.reviewer_id) ? 'reviewer' : 'reviewee' },
        eventAt: row.created_at,
      };
      if ((await emitCommerceEvent(pool, evt)).ok) emitted += 1;
    }
    if (row.created_at && new Date(row.created_at) > new Date(maxTs)) maxTs = row.created_at;
  }

  if ((rows.rows || []).length > 0) {
    await pool.query(
      `INSERT INTO commerce_sync_state (key, last_synced_at, updated_at)
       VALUES ('reviews_sync', $1::timestamptz, NOW())
       ON CONFLICT (key) DO UPDATE SET last_synced_at = EXCLUDED.last_synced_at, updated_at = NOW()`,
      [maxTs],
    ).catch(() => { });
  }

  return { scanned: (rows.rows || []).length, emitted, watermark: maxTs };
}

/**
 * Roll up user_commerce_events into user_commerce_daily for a given date (Bangkok day).
 */
export async function rollupUserCommerceDaily(pool, dayDate) {
  const day = String(dayDate || '').slice(0, 10);
  if (!day) return { ok: false };

  const inTypes = [...IN_EVENT_TYPES, 'escrow_held'];
  const outTypes = [...OUT_EVENT_TYPES];

  await pool.query(
    `INSERT INTO user_commerce_daily (
       user_id, day_date, spend_in, spend_out, jobs_posted, jobs_completed, jobs_disputed,
       deposits_count, withdrawals_count, escrow_held, escrow_released, updated_at
     )
     SELECT
       e.user_id,
       $1::date AS day_date,
       COALESCE(SUM(e.amount) FILTER (
         WHERE e.event_type = ANY($2::text[])
           OR e.event_type IN ('escrow_released', 'referral_bonus', 'escrow_refunded')
           OR (e.event_type = 'escrow_held' AND COALESCE(e.metadata->>'leg', '') IN ('provider_net', 'coach_training_fee'))
       ), 0)::numeric AS spend_in,
       COALESCE(SUM(e.amount) FILTER (
         WHERE e.event_type = ANY($3::text[])
           OR (e.event_type = 'payment_created' AND COALESCE(e.metadata->>'leg', '') = 'user_debit')
       ), 0)::numeric AS spend_out,
       COUNT(*) FILTER (WHERE e.event_type = 'job_posted')::int AS jobs_posted,
       COUNT(*) FILTER (WHERE e.event_type = 'job_completed')::int AS jobs_completed,
       COUNT(*) FILTER (WHERE e.event_type = 'job_disputed')::int AS jobs_disputed,
       COUNT(*) FILTER (WHERE e.event_type = 'wallet_deposit')::int AS deposits_count,
       COUNT(*) FILTER (WHERE e.event_type = 'user_payout_withdrawal')::int AS withdrawals_count,
       COALESCE(SUM(e.amount) FILTER (
         WHERE e.event_type = 'escrow_held' AND COALESCE(e.metadata->>'leg', '') = 'provider_net'
       ), 0)::numeric AS escrow_held,
       COALESCE(SUM(e.amount) FILTER (WHERE e.event_type = 'escrow_released'), 0)::numeric AS escrow_released,
       NOW() AS updated_at
     FROM user_commerce_events e
     WHERE (e.event_at AT TIME ZONE 'Asia/Bangkok')::date = $1::date
     GROUP BY e.user_id
     ON CONFLICT (user_id, day_date) DO UPDATE SET
       spend_in = EXCLUDED.spend_in,
       spend_out = EXCLUDED.spend_out,
       jobs_posted = EXCLUDED.jobs_posted,
       jobs_completed = EXCLUDED.jobs_completed,
       jobs_disputed = EXCLUDED.jobs_disputed,
       deposits_count = EXCLUDED.deposits_count,
       withdrawals_count = EXCLUDED.withdrawals_count,
       escrow_held = EXCLUDED.escrow_held,
       escrow_released = EXCLUDED.escrow_released,
       updated_at = NOW()`,
    [day, inTypes, outTypes],
  );

  await pool.query(
    `WITH cat AS (
       SELECT user_id, COALESCE(category, 'unknown') AS category, SUM(COALESCE(amount, 0)) AS amt
       FROM user_commerce_events
       WHERE (event_at AT TIME ZONE 'Asia/Bangkok')::date = $1::date
         AND amount IS NOT NULL
       GROUP BY user_id, COALESCE(category, 'unknown')
     ),
     agg AS (
       SELECT user_id, jsonb_object_agg(category, to_jsonb(amt)) AS category_spend
       FROM cat
       GROUP BY user_id
     )
     UPDATE user_commerce_daily d
     SET category_spend = COALESCE(a.category_spend, '{}'::jsonb),
         updated_at = NOW()
     FROM agg a
     WHERE d.user_id = a.user_id AND d.day_date = $1::date`,
    [day],
  );

  return { ok: true, day };
}

export async function runCommerceSyncCycle(pool) {
  const ledger = await syncLedgerCommerceEvents(pool);
  const jobs = await syncJobsCommerceEvents(pool);
  const bids = await syncJobBidsCommerceEvents(pool);
  const reviews = await syncJobReviewsCommerceEvents(pool);
  return { ledger, jobs, bids, reviews };
}

export async function runCommerceDailyRollup(pool) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const day = yesterday.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  await rollupUserCommerceDaily(pool, day);
  await rollupUserCommerceDaily(pool, today);
}

export function startCommerceIntelligenceWorkers(pool) {
  const syncMs = Number(process.env.COMMERCE_SYNC_INTERVAL_MS || 120000);
  const rollupMs = Number(process.env.COMMERCE_ROLLUP_INTERVAL_MS || 3600000);

  setInterval(() => {
    void runCommerceSyncCycle(pool).catch((e) => {
      console.warn('[commerce-sync]', e?.message || e);
    });
  }, syncMs);

  setInterval(() => {
    void runCommerceDailyRollup(pool).catch((e) => {
      console.warn('[commerce-rollup]', e?.message || e);
    });
  }, rollupMs);

  void runCommerceSyncCycle(pool).catch(() => { });
  void runCommerceDailyRollup(pool).catch(() => { });
  console.log(`📊 Commerce intelligence workers: sync every ${syncMs / 1000}s, rollup every ${rollupMs / 1000}s`);
}

export function hashUserIdForPartner(userId, salt = '') {
  const s = process.env.PARTNER_API_HASH_SALT || salt || 'meerak-partner-v1';
  return crypto.createHash('sha256').update(`${s}:${userId}`).digest('hex').slice(0, 32);
}

export function buildAnonymizedBundle(userId, profile, { consent = false } = {}) {
  const userHash = hashUserIdForPartner(userId);
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    user_hash: userHash,
    data_sharing_consent: !!consent,
    pii_included: false,
    metrics: profile.metrics || {},
    category_mix: profile.category_mix || {},
    risk_tier: profile.risk_tier || 'unknown',
    funnel: profile.funnel || {},
    period_days: profile.period_days || 90,
  };
}
