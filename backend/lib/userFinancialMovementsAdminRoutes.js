/**
 * Admin: per-user financial movements (deposit / withdraw / admin adjust)
 * Source of truth: payment_ledger_audit — keyset pagination for scale.
 */
import { buildUserRiskProfile } from './userRiskScoreService.js';
import { maybeAlertReconcileFail } from './reconcileAlertWebhook.js';
import { getOpenSupportCaseForUser, maybeAutoCaseReconcileWarn } from './supportCaseService.js';
import { buildReconcileExplain } from './reconcileExplainService.js';
import {
  buildReconcileTrend,
  escalateReconcileRepeatCase,
  reconcileTrendSecurityBadge,
} from './reconcileTrendService.js';

const FINANCIAL_EVENT_TYPES = [
  'wallet_deposit',
  'user_payout_withdrawal',
  'admin_credit',
  'admin_debit',
];

const CATEGORY_EVENT_MAP = {
  deposit: ['wallet_deposit'],
  withdraw: ['user_payout_withdrawal'],
  admin: ['admin_credit', 'admin_debit'],
  job: [],
};

const FAILED_STATUSES = new Set(['failed', 'reversed', 'cancelled', 'rejected', 'expired']);

const JOB_PROVIDER_IN_LEGS = ['provider_net', 'coach_training_fee'];

function normalizeBankAccountNumber(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length >= 6 ? digits : '';
}

function jobMovementSql(userParam = '$1') {
  return `(
    (pla.provider_id = ${userParam}::text AND (
      pla.event_type IN ('escrow_released', 'marine_deposit_released', 'referral_bonus')
      OR (pla.event_type = 'escrow_held' AND COALESCE(pla.metadata->>'leg', '') = ANY(ARRAY['provider_net', 'coach_training_fee']))
    ))
    OR
    (pla.user_id = ${userParam}::text AND pla.job_id IS NOT NULL AND pla.event_type IN ('payment_created', 'escrow_refunded', 'booking_fee', 'post_job_fee', 'referral_bonus', 'penalty_debit'))
  )`;
}

function buildCategoryWhere(category, eventTypes) {
  if (category === 'job') {
    return {
      params: [],
      clauses: [jobMovementSql('$1')],
      nextIdx: 2,
    };
  }
  if (category === 'all') {
    return {
      params: [eventTypes],
      clauses: [
        `((pla.user_id = $1::text AND pla.event_type = ANY($2::text[])) OR ${jobMovementSql('$1')})`,
      ],
      nextIdx: 3,
    };
  }
  return {
    params: [eventTypes],
    clauses: ['pla.user_id = $1::text', 'pla.event_type = ANY($2::text[])'],
    nextIdx: 3,
  };
}

function num(v, fallback = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function encodeCursor(createdAt, id) {
  const iso = createdAt instanceof Date ? createdAt.toISOString() : String(createdAt || '');
  return Buffer.from(JSON.stringify({ t: iso, i: String(id || '') }), 'utf8').toString('base64url');
}

function decodeCursor(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const o = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!o?.t || !o?.i) return null;
    return { created_at: o.t, id: String(o.i) };
  } catch {
    return null;
  }
}

function movementDirection(eventType, meta = {}) {
  const leg = String(meta.leg || '');
  if (eventType === 'wallet_deposit' || eventType === 'admin_credit') return 'in';
  if (eventType === 'user_payout_withdrawal' || eventType === 'admin_debit') return 'out';
  if (['escrow_released', 'marine_deposit_released', 'referral_bonus'].includes(eventType)) return 'in';
  if (eventType === 'escrow_held' && JOB_PROVIDER_IN_LEGS.includes(leg)) return 'in';
  if (eventType === 'escrow_refunded') return 'in';
  if (eventType === 'payment_created' && leg === 'user_debit') return 'out';
  if (eventType === 'booking_fee' || eventType === 'post_job_fee' || eventType === 'penalty_debit') return 'out';
  return 'neutral';
}

function labelForMovement(row) {
  const et = String(row.event_type || '');
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const leg = String(meta.leg || '');
  const jobRef = row.job_id ? String(row.job_id).slice(0, 8) : null;
  const src = String(meta.source_type || row.gateway || '').toLowerCase();
  if (et === 'wallet_deposit') {
    const ch = src || 'gateway';
    return `เติมเงิน (${ch})`;
  }
  if (et === 'user_payout_withdrawal') return 'ถอนเงิน';
  if (et === 'admin_credit') return 'Admin เติม';
  if (et === 'admin_debit') return 'Admin หัก';
  if (et === 'escrow_held' && leg === 'provider_net') {
    return jobRef ? `รายได้งาน (รอปล่อย) · ${jobRef}` : 'รายได้งาน (รอปล่อย)';
  }
  if (et === 'escrow_held' && leg === 'coach_training_fee') return 'ค่าฝึก Coach';
  if (et === 'escrow_released') return jobRef ? `รายได้งาน (ปล่อย) · ${jobRef}` : 'รายได้งาน (ปล่อย)';
  if (et === 'marine_deposit_released') return 'รายได้ Marine (ปล่อย)';
  if (et === 'referral_bonus') return 'โบนัสแนะนำ';
  if (et === 'payment_created' && leg === 'user_debit') return jobRef ? `จ่ายค่างาน · ${jobRef}` : 'จ่ายค่างาน';
  if (et === 'escrow_refunded') return jobRef ? `คืนเงินงาน · ${jobRef}` : 'คืนเงินงาน';
  if (et === 'booking_fee') return 'ค่าจองงาน';
  if (et === 'post_job_fee') return 'ค่าโพสต์งาน';
  if (et === 'penalty_debit') return 'ค่าปรับ/หัก';
  return et;
}

function buildAnomalyFlags(row, enrich) {
  const flags = [];
  const gross = num(row.amount, 0);
  const st = String(row.status || '').toLowerCase();
  if (FAILED_STATUSES.has(st)) flags.push('failed_status');
  if (gross >= 200000) flags.push('high_amount');
  if (row.event_type === 'wallet_deposit' && enrich?.charge_status === 'pending') {
    const ageMs = Date.now() - new Date(row.created_at).getTime();
    if (ageMs > 24 * 60 * 60 * 1000) flags.push('pending_deposit_over_24h');
  }
  if (row.event_type === 'user_payout_withdrawal' && enrich?.payout_status === 'pending') {
    flags.push('pending_withdrawal');
  }
  if (enrich?.reconciliation_status && !['PASS', 'pass', 'OK'].includes(String(enrich.reconciliation_status))) {
    flags.push('payout_recon_warn');
  }
  return flags;
}

export function registerUserFinancialMovementsAdminRoutes(app, pool, adminAuthMiddleware) {
  /**
   * GET /api/admin/users/:id/financial-movements
   * Query: limit (max 50), cursor, category (all|deposit|withdraw|admin|job), from_date, to_date, job_id
   */
  app.get('/api/admin/users/:id/financial-movements', adminAuthMiddleware, async (req, res) => {
    try {
      const userId = String(req.params.id || '').trim();
      if (!userId) return res.status(400).json({ error: 'missing_user_id' });

      const limitRaw = Number(req.query.limit || 25);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 50) : 25;
      const category = String(req.query.category || 'all').trim().toLowerCase();
      const fromDate = String(req.query.from_date || '').trim() || null;
      const toDate = String(req.query.to_date || '').trim() || null;
      const jobIdFilter = String(req.query.job_id || '').trim() || null;
      const cursor = decodeCursor(String(req.query.cursor || '').trim());

      let eventTypes = [...FINANCIAL_EVENT_TYPES];
      if (category !== 'all' && category !== 'job' && CATEGORY_EVENT_MAP[category]) {
        eventTypes = CATEGORY_EVENT_MAP[category];
      }

      const catWhere = buildCategoryWhere(category, eventTypes);
      const params = [userId, ...catWhere.params];
      const where = [...catWhere.clauses];
      let idx = catWhere.nextIdx;

      if (fromDate) {
        params.push(fromDate);
        where.push(`pla.created_at >= $${idx}::date`);
        idx += 1;
      }
      if (toDate) {
        params.push(`${toDate}T23:59:59.999Z`);
        where.push(`pla.created_at <= $${idx}::timestamptz`);
        idx += 1;
      }
      if (jobIdFilter) {
        params.push(jobIdFilter);
        where.push(`pla.job_id::text = $${idx}::text`);
        idx += 1;
      }
      if (cursor?.created_at && cursor?.id) {
        params.push(cursor.created_at, cursor.id);
        where.push(`(pla.created_at, pla.id) < ($${idx}::timestamptz, $${idx + 1}::text)`);
        idx += 2;
      }

      params.push(limit + 1);
      const limitParam = idx;

      const listSql = `
        SELECT
          pla.id,
          pla.event_type,
          pla.payment_id,
          pla.gateway,
          pla.job_id,
          pla.amount,
          pla.net_amount,
          pla.platform_margin_amount,
          pla.gateway_fee_amount,
          pla.currency,
          pla.status,
          pla.bill_no,
          pla.transaction_no,
          pla.metadata,
          pla.created_at
        FROM payment_ledger_audit pla
        WHERE ${where.join(' AND ')}
        ORDER BY pla.created_at DESC, pla.id DESC
        LIMIT $${limitParam}
      `;

      const jobSummarySql = `
        SELECT
          COUNT(*) FILTER (WHERE
            (pla.provider_id = $1::text AND (
              pla.event_type IN ('escrow_released', 'marine_deposit_released', 'referral_bonus')
              OR (pla.event_type = 'escrow_held' AND COALESCE(pla.metadata->>'leg', '') = ANY(ARRAY['provider_net', 'coach_training_fee']))
            ))
            OR (pla.event_type = 'escrow_refunded' AND pla.user_id = $1::text)
          )::int AS earnings_count,
          COALESCE(SUM(COALESCE(pla.net_amount, pla.amount, 0)) FILTER (WHERE
            (pla.provider_id = $1::text AND (
              pla.event_type IN ('escrow_released', 'marine_deposit_released', 'referral_bonus')
              OR (pla.event_type = 'escrow_held' AND COALESCE(pla.metadata->>'leg', '') = ANY(ARRAY['provider_net', 'coach_training_fee']))
            ))
            OR (pla.event_type = 'escrow_refunded' AND pla.user_id = $1::text)
          ), 0)::numeric AS earnings_total,
          COUNT(*) FILTER (WHERE
            pla.user_id = $1::text AND pla.event_type IN ('payment_created', 'booking_fee', 'post_job_fee', 'penalty_debit') AND pla.job_id IS NOT NULL
          )::int AS expenses_count,
          COALESCE(SUM(COALESCE(pla.net_amount, pla.amount, 0)) FILTER (WHERE
            pla.user_id = $1::text AND pla.event_type IN ('payment_created', 'booking_fee', 'post_job_fee', 'penalty_debit') AND pla.job_id IS NOT NULL
          ), 0)::numeric AS expenses_total
        FROM payment_ledger_audit pla
        WHERE ${jobMovementSql('$1')}
          AND LOWER(COALESCE(pla.status, 'completed')) NOT IN ('failed', 'reversed', 'cancelled', 'rejected', 'expired')
      `;

      const [listRes, summaryRes, jobSummaryRes, pendingDepRes, pendingPayRes, velocityRes, userWalletRes, pendingSettleRes, pendingDepPreviewRes, pendingPayPreviewRes, deviceHopRes, bankDupRes] = await Promise.all([
        pool.query(listSql, params),
        pool.query(
          `SELECT
             pla.event_type,
             COUNT(*)::int AS cnt,
             COALESCE(SUM(COALESCE(pla.net_amount, pla.amount, 0)), 0)::numeric AS total_net,
             COALESCE(SUM(COALESCE(pla.amount, 0)), 0)::numeric AS total_gross
           FROM payment_ledger_audit pla
           WHERE pla.user_id = $1::text
             AND pla.event_type = ANY($2::text[])
             AND LOWER(COALESCE(pla.status, 'completed')) NOT IN ('failed', 'reversed', 'cancelled', 'rejected')
           GROUP BY pla.event_type`,
          [userId, FINANCIAL_EVENT_TYPES],
        ),
        pool.query(jobSummarySql, [userId]).catch(() => ({
          rows: [{ earnings_count: 0, earnings_total: 0, expenses_count: 0, expenses_total: 0 }],
        })),
        pool.query(
          `SELECT COUNT(*)::int AS cnt,
                  COALESCE(SUM(amount), 0)::numeric AS total
           FROM wallet_deposit_charges
           WHERE user_id = $1::uuid AND LOWER(COALESCE(status, '')) = 'pending'`,
          [userId],
        ).catch(() => ({ rows: [{ cnt: 0, total: 0 }] })),
        pool.query(
          `SELECT COUNT(*)::int AS cnt,
                  COALESCE(SUM(amount), 0)::numeric AS total
           FROM payout_requests
           WHERE user_id = $1::uuid AND LOWER(COALESCE(status, '')) = 'pending'`,
          [userId],
        ).catch(() => ({ rows: [{ cnt: 0, total: 0 }] })),
        pool.query(
          `SELECT
             COUNT(*) FILTER (WHERE event_type = 'wallet_deposit')::int AS deposits_24h,
             COALESCE(SUM(COALESCE(net_amount, amount)) FILTER (WHERE event_type = 'wallet_deposit'), 0)::numeric AS deposit_net_24h,
             COUNT(*) FILTER (WHERE event_type = 'user_payout_withdrawal')::int AS withdrawals_24h,
             COALESCE(SUM(COALESCE(net_amount, amount)) FILTER (WHERE event_type = 'user_payout_withdrawal'), 0)::numeric AS withdrawal_gross_24h
           FROM payment_ledger_audit
           WHERE user_id = $1::text
             AND event_type IN ('wallet_deposit', 'user_payout_withdrawal')
             AND created_at >= NOW() - INTERVAL '24 hours'
             AND LOWER(COALESCE(status, 'completed')) NOT IN ('failed', 'reversed', 'cancelled')`,
          [userId],
        ),
        pool.query(
          `SELECT wallet_balance, wallet_balance_withdrawable, wallet_pending, wallet_frozen, account_status,
                kyc_status, kyc_level, bank_accounts, email, full_name
         FROM users WHERE id = $1::uuid`,
          [userId],
        ).catch(() => ({ rows: [] })),
        pool.query(
          `SELECT COALESCE(SUM(net_amount_thb), 0)::numeric AS total
           FROM wallet_transactions
           WHERE user_id = $1::uuid AND settlement_status = 'PENDING_SETTLEMENT'`,
          [userId],
        ).catch(() => ({ rows: [{ total: 0 }] })),
        pool.query(
          `SELECT
             c.charge_id,
             c.amount,
             c.source_type,
             c.status,
             c.created_at,
             COALESCE(wl.webhook_count, 0)::int AS webhook_count,
             wl.last_webhook_status,
             wl.last_webhook_at
           FROM wallet_deposit_charges c
           LEFT JOIN LATERAL (
             SELECT
               COUNT(*)::int AS webhook_count,
               (ARRAY_AGG(w.event_status ORDER BY w.created_at DESC))[1] AS last_webhook_status,
               MAX(w.created_at) AS last_webhook_at
             FROM wallet_deposit_webhook_logs w
             WHERE w.charge_id = c.charge_id
           ) wl ON true
           WHERE c.user_id = $1::uuid AND LOWER(COALESCE(c.status, '')) = 'pending'
           ORDER BY c.created_at DESC
           LIMIT 8`,
          [userId],
        ).catch(() => ({ rows: [] })),
        pool.query(
          `SELECT id::text AS id, amount, created_at, status
           FROM payout_requests
           WHERE user_id = $1::uuid AND LOWER(COALESCE(status, '')) = 'pending'
           ORDER BY created_at DESC LIMIT 5`,
          [userId],
        ).catch(() => ({ rows: [] })),
        pool.query(
          `SELECT COUNT(DISTINCT ip_address)::int AS cnt
           FROM user_login_sessions
           WHERE user_id = $1::uuid AND created_at > NOW() - INTERVAL '24 hours' AND ip_address IS NOT NULL`,
          [userId],
        ).catch(() => ({ rows: [{ cnt: 0 }] })),
        pool.query(
          `WITH mine AS (
             SELECT DISTINCT regexp_replace(COALESCE(elem->>'account_number', ''), '[^0-9]', '', 'g') AS acct_norm,
                    COALESCE(elem->>'bank_name', elem->>'provider_name', '') AS bank_label,
                    COALESCE(elem->>'account_number', '') AS account_number_raw
             FROM users u
             CROSS JOIN LATERAL jsonb_array_elements(COALESCE(u.bank_accounts, '[]'::jsonb)) elem
             WHERE u.id = $1::uuid
           ),
           payout_mine AS (
             SELECT DISTINCT regexp_replace(COALESCE(p.bank_details->>'account_number', ''), '[^0-9]', '', 'g') AS acct_norm,
                    COALESCE(p.bank_details->>'bank_name', p.bank_details->>'provider_name', '') AS bank_label,
                    COALESCE(p.bank_details->>'account_number', '') AS account_number_raw
             FROM payout_requests p
             WHERE p.user_id = $1::uuid
               AND COALESCE(p.bank_details->>'account_number', '') <> ''
           ),
           all_mine AS (
             SELECT * FROM mine WHERE length(acct_norm) >= 6
             UNION
             SELECT * FROM payout_mine WHERE length(acct_norm) >= 6
           )
           SELECT DISTINCT ON (m.acct_norm, u.id)
             m.account_number_raw AS account_number,
             m.bank_label AS bank_name,
             u.id::text AS other_user_id,
             u.full_name AS other_user_name,
             u.email AS other_user_email,
             'bank_accounts' AS match_source
           FROM all_mine m
           JOIN users u ON u.id <> $1::uuid
           CROSS JOIN LATERAL jsonb_array_elements(COALESCE(u.bank_accounts, '[]'::jsonb)) elem
           WHERE regexp_replace(COALESCE(elem->>'account_number', ''), '[^0-9]', '', 'g') = m.acct_norm
           UNION
           SELECT DISTINCT ON (m.acct_norm, p.user_id)
             m.account_number_raw,
             m.bank_label,
             p.user_id::text,
             u.full_name,
             u.email,
             'payout_request'
           FROM all_mine m
           JOIN payout_requests p ON p.user_id <> $1::uuid
           JOIN users u ON u.id = p.user_id
           WHERE regexp_replace(COALESCE(p.bank_details->>'account_number', ''), '[^0-9]', '', 'g') = m.acct_norm
           LIMIT 20`,
          [userId],
        ).catch(() => ({ rows: [] })),
      ]);

      const rawRows = listRes.rows || [];
      const hasMore = rawRows.length > limit;
      const pageRows = hasMore ? rawRows.slice(0, limit) : rawRows;

      const depositPaymentIds = pageRows
        .filter((r) => r.event_type === 'wallet_deposit' && r.payment_id)
        .map((r) => String(r.payment_id));
      const payoutPaymentIds = pageRows
        .filter((r) => r.event_type === 'user_payout_withdrawal' && r.payment_id)
        .map((r) => String(r.payment_id));

      const enrichMap = new Map();

      if (depositPaymentIds.length) {
        const chRes = await pool.query(
          `SELECT c.charge_id, c.status AS charge_status, c.source_type, c.ledger_id,
                  wt.settlement_status, wt.is_withdrawable, wt.available_on::timestamptz AS available_on
           FROM wallet_deposit_charges c
           LEFT JOIN wallet_transactions wt ON wt.ledger_id = c.ledger_id
           WHERE c.charge_id = ANY($1::text[])`,
          [depositPaymentIds],
        ).catch(() => ({ rows: [] }));
        for (const r of chRes.rows || []) {
          enrichMap.set(String(r.charge_id), {
            charge_status: r.charge_status,
            source_type: r.source_type,
            settlement_status: r.settlement_status,
            is_withdrawable: r.is_withdrawable,
            available_on: r.available_on,
          });
        }
      }

      if (payoutPaymentIds.length) {
        const poRes = await pool.query(
          `SELECT id::text AS id, status AS payout_status, reconciliation_status,
                  security_hold_until, anomaly_hold_reason
           FROM payout_requests
           WHERE id::text = ANY($1::text[])`,
          [payoutPaymentIds],
        ).catch(() => ({ rows: [] }));
        for (const r of poRes.rows || []) {
          enrichMap.set(String(r.id), {
            payout_status: r.payout_status,
            reconciliation_status: r.reconciliation_status,
            security_hold_until: r.security_hold_until,
            anomaly_hold_reason: r.anomaly_hold_reason,
          });
        }
      }

      const items = pageRows.map((r) => {
        const meta = r.metadata && typeof r.metadata === 'object' ? r.metadata : {};
        const paymentId = r.payment_id ? String(r.payment_id) : '';
        const enrich = paymentId ? enrichMap.get(paymentId) || {} : {};
        const gross = num(r.amount, 0);
        const net = num(r.net_amount, gross);
        const fee = Math.max(0, gross - net);
        return {
          id: String(r.id),
          event_type: r.event_type,
          direction: movementDirection(r.event_type, meta),
          label: labelForMovement({ ...r, metadata: meta }),
          gross_amount: gross,
          net_amount: net,
          fee_amount: fee > 0 ? fee : undefined,
          currency: r.currency || 'THB',
          status: r.status || 'completed',
          gateway: r.gateway || null,
          job_id: r.job_id ? String(r.job_id) : null,
          payment_id: paymentId || null,
          bill_no: r.bill_no || null,
          transaction_no: r.transaction_no || null,
          source_type: enrich.source_type || meta.source_type || null,
          charge_status: enrich.charge_status || null,
          settlement_status: enrich.settlement_status || meta.settlement_status || null,
          is_withdrawable: enrich.is_withdrawable ?? meta.is_withdrawable ?? null,
          available_on: enrich.available_on
            ? new Date(enrich.available_on).toISOString()
            : meta.available_on || null,
          payout_status: enrich.payout_status || null,
          reconciliation_status: enrich.reconciliation_status || null,
          anomaly_hold_reason: enrich.anomaly_hold_reason || null,
          anomaly_flags: buildAnomalyFlags(r, enrich),
          created_at: r.created_at ? new Date(r.created_at).toISOString() : null,
        };
      });

      const summaryByType = {};
      for (const row of summaryRes.rows || []) {
        summaryByType[row.event_type] = {
          count: parseInt(row.cnt, 10) || 0,
          total_net: num(row.total_net, 0),
          total_gross: num(row.total_gross, 0),
        };
      }

      const vel = velocityRes.rows?.[0] || {};
      const riskSignals = [];
      const pendingDepCnt = parseInt(pendingDepRes.rows?.[0]?.cnt, 10) || 0;
      if (pendingDepCnt > 0) {
        riskSignals.push({
          code: 'PENDING_DEPOSITS',
          count: pendingDepCnt,
          total_thb: num(pendingDepRes.rows?.[0]?.total, 0),
          severity: pendingDepCnt >= 3 ? 'high' : 'medium',
        });
      }
      const pendingPayCnt = parseInt(pendingPayRes.rows?.[0]?.cnt, 10) || 0;
      if (pendingPayCnt > 0) {
        riskSignals.push({
          code: 'PENDING_WITHDRAWALS',
          count: pendingPayCnt,
          total_thb: num(pendingPayRes.rows?.[0]?.total, 0),
          severity: 'medium',
        });
      }
      const dep24 = parseInt(vel.deposits_24h, 10) || 0;
      if (dep24 >= 10) {
        riskSignals.push({
          code: 'DEPOSIT_VELOCITY_24H',
          count: dep24,
          total_thb: num(vel.deposit_net_24h, 0),
          severity: dep24 >= 20 ? 'high' : 'medium',
        });
      }
      const wd24 = parseInt(vel.withdrawals_24h, 10) || 0;
      if (wd24 >= 5) {
        riskSignals.push({
          code: 'WITHDRAW_VELOCITY_24H',
          count: wd24,
          total_thb: num(vel.withdrawal_gross_24h, 0),
          severity: wd24 >= 10 ? 'high' : 'medium',
        });
      }

      const jobSum = jobSummaryRes.rows?.[0] || {};
      const userRowEarly = userWalletRes.rows?.[0] || {};
      const kycStatus = String(userRowEarly.kyc_status || '').toLowerCase();
      const kycVerified = kycStatus === 'verified' || kycStatus === 'approved';
      const wdCount = summaryByType.user_payout_withdrawal?.count || 0;
      if (!kycVerified && wdCount > 0) {
        riskSignals.push({
          code: 'KYC_UNVERIFIED_WITHDRAWAL',
          count: wdCount,
          severity: 'high',
        });
      }

      const bankDuplicateWarnings = (bankDupRes.rows || []).map((r) => ({
        account_number: String(r.account_number || ''),
        bank_name: r.bank_name || null,
        other_user_id: String(r.other_user_id || ''),
        other_user_name: r.other_user_name || null,
        other_user_email: r.other_user_email || null,
        match_source: r.match_source || 'bank_accounts',
      }));
      if (bankDuplicateWarnings.length > 0) {
        riskSignals.push({
          code: 'DUPLICATE_BANK_ACCOUNT',
          count: bankDuplicateWarnings.length,
          severity: 'high',
        });
      }

      const deviceHopCnt = parseInt(deviceHopRes.rows?.[0]?.cnt, 10) || 0;
      const deviceHopping = deviceHopCnt > 3;
      const securityRiskBadges = [];
      if (deviceHopping) {
        securityRiskBadges.push({
          code: 'DEVICE_HOPPING',
          label: `Device hopping (${deviceHopCnt} IP / 24 ชม.)`,
          severity: 'high',
        });
      }
      if (dep24 >= 10) {
        securityRiskBadges.push({
          code: 'DEPOSIT_VELOCITY_24H',
          label: `เติมถี่ ${dep24} ครั้ง / 24 ชม.`,
          severity: dep24 >= 20 ? 'high' : 'medium',
          count: dep24,
        });
      }
      if (wd24 >= 5) {
        securityRiskBadges.push({
          code: 'WITHDRAW_VELOCITY_24H',
          label: `ถอนถี่ ${wd24} ครั้ง / 24 ชม.`,
          severity: wd24 >= 10 ? 'high' : 'medium',
          count: wd24,
        });
      }
      if (!kycVerified && wdCount > 0) {
        securityRiskBadges.push({
          code: 'KYC_UNVERIFIED_WITHDRAWAL',
          label: 'KYC ไม่ผ่าน แต่มีประวัติถอน',
          severity: 'high',
          count: wdCount,
        });
      }
      if (bankDuplicateWarnings.length > 0) {
        securityRiskBadges.push({
          code: 'DUPLICATE_BANK_ACCOUNT',
          label: `บัญชีซ้ำกับ user อื่น (${bankDuplicateWarnings.length})`,
          severity: 'high',
          count: bankDuplicateWarnings.length,
        });
      }

      const lastRow = pageRows.length ? pageRows[pageRows.length - 1] : null;
      const nextCursor =
        hasMore && lastRow ? encodeCursor(lastRow.created_at, lastRow.id) : null;

      const userRow = userWalletRes.rows?.[0] || {};
      const walletBalance = num(userRow.wallet_balance, 0);
      const walletWithdrawable = num(userRow.wallet_balance_withdrawable, walletBalance);
      const walletPending = num(userRow.wallet_pending, 0);
      const pendingSettlementThb = num(pendingSettleRes.rows?.[0]?.total, 0);
      const accountStatus = String(userRow.account_status || '').toLowerCase();
      const walletFrozenEffective = !!(
        userRow.wallet_frozen || accountStatus === 'suspended' || accountStatus === 'banned'
      );
      const otherLockedThb = Math.max(
        0,
        Math.round((walletBalance - walletWithdrawable - pendingSettlementThb - walletPending) * 100) / 100,
      );

      const depNet = num(summaryByType.wallet_deposit?.total_net, 0);
      const wdGross = num(summaryByType.user_payout_withdrawal?.total_gross, 0);
      const adminCr = num(summaryByType.admin_credit?.total_net, 0);
      const adminDb = num(summaryByType.admin_debit?.total_gross, 0);
      const jobEarnings = num(jobSum.earnings_total, 0);
      const jobExpenses = num(jobSum.expenses_total, 0);
      const reconcileExplain = buildReconcileExplain({
        walletBalance,
        depNet,
        wdGross,
        adminCr,
        adminDb,
        jobEarnings,
        jobExpenses,
        walletPending,
        pendingSettlement: pendingSettlementThb,
        otherLocked: otherLockedThb,
      });
      const reconcilePass = reconcileExplain.simple.status === 'pass'
        || reconcileExplain.explained.status === 'pass';
      const variance = reconcileExplain.simple.variance;

      const compositeRisk = await buildUserRiskProfile(pool, userId).catch(() => null);
      const reconcileTrend = await buildReconcileTrend(pool, userId).catch(() => null);
      const trendBadge = reconcileTrendSecurityBadge(reconcileTrend);
      if (trendBadge) {
        securityRiskBadges.push(trendBadge);
      }

      let supportCaseRow = await getOpenSupportCaseForUser(pool, userId).catch(() => null);
      let supportCaseCreated = false;
      let reconcileEscalated = false;

      if (!reconcilePass) {
        const autoCase = await maybeAutoCaseReconcileWarn(pool, userId, {
          expected_balance: reconcileExplain.explained.expected_balance,
          actual_balance: walletBalance,
          variance: reconcileExplain.explained.variance,
          email: userRow.email,
        }).catch(() => ({ case: supportCaseRow, created: false }));
        if (autoCase?.case) {
          supportCaseRow = autoCase.case;
          supportCaseCreated = !!autoCase.created;
        }
        if (reconcileTrend?.is_repeat_offender) {
          const esc = await escalateReconcileRepeatCase(pool, userId, reconcileTrend).catch(() => null);
          if (esc?.escalated) {
            reconcileEscalated = true;
            if (esc.case) {
              supportCaseRow = {
                ...(supportCaseRow || {}),
                ...esc.case,
                priority: 'urgent',
              };
            }
          }
        }
        void maybeAlertReconcileFail(pool, {
          userId,
          email: userRow.email,
          caseId: supportCaseRow?.case_id,
          expected_balance: reconcileExplain.explained.expected_balance,
          actual_balance: walletBalance,
          variance: reconcileExplain.explained.variance,
          status: 'warn',
        }).catch(() => { });
      }

      const supportCaseResult = { case: supportCaseRow, created: supportCaseCreated };

      return res.json({
        items,
        next_cursor: nextCursor,
        has_more: hasMore,
        wallet_snapshot: {
          wallet_balance: walletBalance,
          wallet_balance_withdrawable: walletWithdrawable,
          wallet_pending: walletPending,
          wallet_frozen: walletFrozenEffective,
          pending_settlement_thb: pendingSettlementThb,
          other_locked_thb: otherLockedThb,
        },
        reconcile: {
          expected_balance: reconcileExplain.simple.expected_balance,
          actual_balance: walletBalance,
          variance: reconcileExplain.simple.variance,
          status: reconcilePass ? 'pass' : 'warn',
          formula: reconcileExplain.simple.formula,
          components: {
            deposits_net: depNet,
            withdrawals_gross: wdGross,
            admin_credits: adminCr,
            admin_debits: adminDb,
            job_earnings: jobEarnings,
            job_expenses: jobExpenses,
          },
          explain: reconcileExplain,
          note: reconcilePass
            ? null
            : reconcileExplain.verdict_th,
        },
        pending_deposit_items: (pendingDepPreviewRes.rows || []).map((r) => ({
          charge_id: String(r.charge_id || ''),
          amount: num(r.amount, 0),
          source_type: r.source_type || null,
          status: r.status || 'pending',
          created_at: r.created_at ? new Date(r.created_at).toISOString() : null,
          webhook_count: parseInt(r.webhook_count, 10) || 0,
          webhook_received: (parseInt(r.webhook_count, 10) || 0) > 0,
          last_webhook_status: r.last_webhook_status || null,
          last_webhook_at: r.last_webhook_at ? new Date(r.last_webhook_at).toISOString() : null,
          can_reconcile: String(r.source_type || '').toLowerCase() !== 'manual',
        })),
        pending_withdrawal_items: (pendingPayPreviewRes.rows || []).map((r) => ({
          id: String(r.id || ''),
          amount: num(r.amount, 0),
          status: r.status || 'pending',
          created_at: r.created_at ? new Date(r.created_at).toISOString() : null,
        })),
        bank_duplicate_warnings: bankDuplicateWarnings,
        security_risk_badges: securityRiskBadges,
        composite_risk: compositeRisk,
        reconcile_trend: reconcileTrend,
        reconcile_escalated: reconcileEscalated,
        support_case: supportCaseResult?.case || null,
        summary: {
          deposits: summaryByType.wallet_deposit || { count: 0, total_net: 0, total_gross: 0 },
          withdrawals: summaryByType.user_payout_withdrawal || { count: 0, total_net: 0, total_gross: 0 },
          admin_credits: summaryByType.admin_credit || { count: 0, total_net: 0, total_gross: 0 },
          admin_debits: summaryByType.admin_debit || { count: 0, total_net: 0, total_gross: 0 },
          job_earnings: {
            count: parseInt(jobSum.earnings_count, 10) || 0,
            total_thb: num(jobSum.earnings_total, 0),
          },
          job_expenses: {
            count: parseInt(jobSum.expenses_count, 10) || 0,
            total_thb: num(jobSum.expenses_total, 0),
          },
          pending_deposits: {
            count: pendingDepCnt,
            total_thb: num(pendingDepRes.rows?.[0]?.total, 0),
          },
          pending_withdrawals: {
            count: pendingPayCnt,
            total_thb: num(pendingPayRes.rows?.[0]?.total, 0),
          },
        },
        risk_signals: riskSignals,
        pagination: {
          limit,
          mode: 'keyset',
          category,
          job_id: jobIdFilter,
        },
      });
    } catch (err) {
      console.error('GET /api/admin/users/:id/financial-movements error:', err?.message || err);
      return res.status(500).json({ error: err?.message || 'โหลดประวัติการเงินล้มเหลว' });
    }
  });

  /**
   * GET /api/admin/users/:id/financial-audit
   * Per-user financial audit: webhooks, reconcile, admin adjust, payout recon R1–R5
   */
  app.get('/api/admin/users/:id/financial-audit', adminAuthMiddleware, async (req, res) => {
    try {
      const userId = String(req.params.id || '').trim();
      if (!userId) return res.status(400).json({ error: 'missing_user_id' });
      const limitRaw = Number(req.query.limit || 80);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 150) : 80;

      const [
        finAuditRes,
        webhookRes,
        payoutReconRes,
        adminLedgerRes,
        auditLogRes,
        userRes,
        walletSnap,
      ] = await Promise.all([
        pool.query(
          `SELECT id, actor_type, actor_id, action, entity_type, entity_id, state_before, state_after,
                  reason, correlation_id, external_ref, created_at
           FROM financial_audit_log
           WHERE entity_id = $1::text
              OR actor_id = $1::text
              OR correlation_id IN (SELECT charge_id FROM wallet_deposit_charges WHERE user_id = $1::uuid)
              OR entity_id IN (SELECT charge_id FROM wallet_deposit_charges WHERE user_id = $1::uuid)
              OR entity_id IN (SELECT id::text FROM payout_requests WHERE user_id = $1::uuid)
              OR entity_id IN (SELECT id::text FROM manual_deposits WHERE user_id = $1::uuid)
           ORDER BY created_at DESC
           LIMIT $2`,
          [userId, limit],
        ).catch(() => ({ rows: [] })),
        pool.query(
          `SELECT w.id, w.charge_id, w.provider, w.event_status, w.http_status, w.signature_valid,
                  w.processing_result, w.transaction_id, w.amount, w.created_at
           FROM wallet_deposit_webhook_logs w
           INNER JOIN wallet_deposit_charges c ON c.charge_id = w.charge_id
           WHERE c.user_id = $1::uuid
           ORDER BY w.created_at DESC
           LIMIT $2`,
          [userId, limit],
        ).catch(() => ({ rows: [] })),
        pool.query(
          `SELECT id::text AS id, amount, status, reconciliation_status, reconciliation_details,
                  created_at, processed_at, reconciled_at
           FROM payout_requests
           WHERE user_id = $1::uuid
           ORDER BY created_at DESC
           LIMIT $2`,
          [userId, Math.min(limit, 50)],
        ).catch(() => ({ rows: [] })),
        pool.query(
          `SELECT id, event_type, amount, net_amount, status, bill_no, metadata, created_at
           FROM payment_ledger_audit
           WHERE user_id = $1::text AND event_type IN ('admin_credit', 'admin_debit')
           ORDER BY created_at DESC
           LIMIT 30`,
          [userId],
        ).catch(() => ({ rows: [] })),
        pool.query(
          `SELECT id, actor_id, action, entity_name, entity_id, changes, created_at
           FROM audit_log
           WHERE entity_id = $1::text AND action IN ('wallet_adjust', 'wallet_freeze', 'emergency_suspend')
           ORDER BY created_at DESC
           LIMIT 30`,
          [userId],
        ).catch(() => ({ rows: [] })),
        pool.query(
          `SELECT id, email, full_name, phone, wallet_balance, kyc_status FROM users WHERE id = $1::uuid`,
          [userId],
        ).catch(() => ({ rows: [] })),
        pool.query(
          `SELECT COUNT(*)::int AS pending_dep,
                  COALESCE(SUM(amount), 0)::numeric AS pending_dep_thb
           FROM wallet_deposit_charges
           WHERE user_id = $1::uuid AND LOWER(COALESCE(status, '')) = 'pending'`,
          [userId],
        ).catch(() => ({ rows: [{ pending_dep: 0, pending_dep_thb: 0 }] })),
      ]);

      const items = [];

      for (const r of finAuditRes.rows || []) {
        items.push({
          id: `fin-${r.id}`,
          source: 'financial_audit_log',
          category: categorizeFinancialAction(r.action, r.entity_type),
          title: String(r.action || 'FINANCIAL_EVENT'),
          detail: r.reason || null,
          entity_type: r.entity_type || null,
          entity_id: r.entity_id || null,
          actor_id: r.actor_id || null,
          state_after: r.state_after || null,
          created_at: r.created_at ? new Date(r.created_at).toISOString() : null,
        });
      }

      for (const r of webhookRes.rows || []) {
        const proc = r.processing_result && typeof r.processing_result === 'object' ? r.processing_result : {};
        items.push({
          id: `wh-${r.id}`,
          source: 'webhook',
          category: 'webhook',
          title: `Webhook ${String(r.provider || 'payso').toUpperCase()} · ${r.event_status || 'event'}`,
          detail: proc.message || proc.error || r.transaction_id || null,
          entity_type: 'wallet_deposit_charge',
          entity_id: r.charge_id || null,
          charge_id: r.charge_id || null,
          http_status: r.http_status ?? null,
          signature_valid: r.signature_valid ?? null,
          amount: num(r.amount, 0) || undefined,
          created_at: r.created_at ? new Date(r.created_at).toISOString() : null,
        });
      }

      for (const r of payoutReconRes.rows || []) {
        let details = {};
        if (r.reconciliation_details && typeof r.reconciliation_details === 'object') {
          details = r.reconciliation_details;
        } else if (typeof r.reconciliation_details === 'string') {
          try { details = JSON.parse(r.reconciliation_details); } catch { /* ignore */ }
        }
        const rRules = ['R1', 'R2', 'R3', 'R4', 'R5'].map((k) => {
          const rule = details[k];
          if (!rule) return null;
          return { rule: k, ok: !!rule.ok, reason: rule.reason || rule.error || null };
        }).filter(Boolean);
        items.push({
          id: `payout-recon-${r.id}`,
          source: 'payout_reconciliation',
          category: 'payout_recon',
          title: `Payout recon ${String(r.reconciliation_status || 'PENDING').toUpperCase()} · ฿${num(r.amount, 0)}`,
          detail: rRules.length ? rRules.map((x) => `${x.rule}:${x.ok ? 'PASS' : 'FAIL'}`).join(' ') : null,
          entity_type: 'payout_request',
          entity_id: r.id,
          payout_id: r.id,
          amount: num(r.amount, 0),
          status: r.status || null,
          reconciliation_status: r.reconciliation_status || 'PENDING',
          reconciliation_rules: rRules,
          created_at: r.created_at ? new Date(r.created_at).toISOString() : null,
          processed_at: r.processed_at ? new Date(r.processed_at).toISOString() : null,
        });
      }

      for (const r of adminLedgerRes.rows || []) {
        const meta = r.metadata && typeof r.metadata === 'object' ? r.metadata : {};
        items.push({
          id: `ledger-admin-${r.id}`,
          source: 'payment_ledger_audit',
          category: 'admin_adjust',
          title: r.event_type === 'admin_credit' ? 'Admin เติมเงิน' : 'Admin หักเงิน',
          detail: meta.reason || meta.admin_reason || r.bill_no || null,
          entity_type: 'payment_ledger_audit',
          entity_id: r.id,
          amount: num(r.net_amount ?? r.amount, 0),
          created_at: r.created_at ? new Date(r.created_at).toISOString() : null,
        });
      }

      for (const r of auditLogRes.rows || []) {
        const ch = r.changes && typeof r.changes === 'object' ? r.changes : {};
        items.push({
          id: `audit-${r.id}`,
          source: 'audit_log',
          category: r.action === 'wallet_adjust' ? 'admin_adjust' : 'account',
          title: String(r.action || 'audit'),
          detail: ch.new?.reason || null,
          entity_type: r.entity_name || 'users',
          entity_id: r.entity_id || null,
          actor_id: r.actor_id || null,
          state_after: ch.new || null,
          created_at: r.created_at ? new Date(r.created_at).toISOString() : null,
        });
      }

      items.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
      const page = items.slice(0, limit);

      const u = userRes.rows?.[0] || {};
      const pendingDep = walletSnap.rows?.[0] || {};
      const supportCaseForAudit = await getOpenSupportCaseForUser(pool, userId).catch(() => null);
      const caseSummary = buildCaseSummary({
        userId,
        caseId: supportCaseForAudit?.case_id,
        email: u.email,
        fullName: u.full_name,
        phone: u.phone,
        walletBalance: num(u.wallet_balance, 0),
        kycStatus: u.kyc_status,
        pendingDeposits: parseInt(pendingDep.pending_dep, 10) || 0,
        pendingDepositsThb: num(pendingDep.pending_dep_thb, 0),
        recentItems: page.slice(0, 8),
      });

      return res.json({
        items: page,
        total_fetched: items.length,
        case_summary: caseSummary,
        support_case: supportCaseForAudit || null,
      });
    } catch (err) {
      console.error('GET /api/admin/users/:id/financial-audit error:', err?.message || err);
      return res.status(500).json({ error: err?.message || 'โหลด financial audit ล้มเหลว' });
    }
  });

  /**
   * GET /api/admin/users/:id/financial-movements/export — CSV ประวัติการเงิน user
   */
  app.get('/api/admin/users/:id/financial-movements/export', adminAuthMiddleware, async (req, res) => {
    try {
      const userId = String(req.params.id || '').trim();
      if (!userId) return res.status(400).json({ error: 'missing_user_id' });

      const rows = await pool.query(
        `SELECT id, event_type, payment_id, gateway, job_id, amount, net_amount, currency, status,
                bill_no, transaction_no, metadata, created_at
         FROM payment_ledger_audit pla
         WHERE (pla.user_id = $1::text AND pla.event_type = ANY($2::text[]))
            OR ${jobMovementSql('$1')}
         ORDER BY pla.created_at DESC
         LIMIT 2000`,
        [userId, FINANCIAL_EVENT_TYPES],
      ).catch(() => ({ rows: [] }));

      const header = 'created_at,event_type,label,direction,amount_net,currency,status,payment_id,job_id,gateway\n';
      const lines = (rows.rows || []).map((r) => {
        const meta = r.metadata && typeof r.metadata === 'object' ? r.metadata : {};
        const label = labelForMovement({ ...r, metadata: meta });
        const dir = movementDirection(r.event_type, meta);
        const net = num(r.net_amount ?? r.amount, 0);
        return [
          csvCell(r.created_at ? new Date(r.created_at).toISOString() : ''),
          csvCell(r.event_type),
          csvCell(label),
          csvCell(dir),
          csvCell(net),
          csvCell(r.currency || 'THB'),
          csvCell(r.status || ''),
          csvCell(r.payment_id || ''),
          csvCell(r.job_id || ''),
          csvCell(r.gateway || ''),
        ].join(',');
      });

      const csv = '\uFEFF' + header + lines.join('\n');
      const safeName = userId.slice(0, 8);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="user-financial-${safeName}-${Date.now()}.csv"`);
      return res.send(csv);
    } catch (err) {
      console.error('GET /api/admin/users/:id/financial-movements/export error:', err?.message || err);
      return res.status(500).json({ error: err?.message || 'export_failed' });
    }
  });
}

function csvCell(v) {
  const s = String(v ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function categorizeFinancialAction(action, entityType) {
  const a = String(action || '').toLowerCase();
  const et = String(entityType || '').toLowerCase();
  if (a.includes('webhook')) return 'webhook';
  if (a.includes('reconcile')) return 'reconcile';
  if (a.includes('manual_deposit')) return 'deposit';
  if (a.includes('payout') || et.includes('payout')) return 'payout_recon';
  if (a.includes('wallet') || a.includes('adjust') || a.includes('credit') || a.includes('debit')) return 'admin_adjust';
  return 'financial';
}

function buildCaseSummary(p) {
  const lines = [
    '=== MEERAK User Financial Case ===',
    p.caseId ? `Case ID: ${p.caseId}` : null,
    `User ID: ${p.userId}`,
    p.fullName ? `Name: ${p.fullName}` : null,
    p.email ? `Email: ${p.email}` : null,
    p.phone ? `Phone: ${p.phone}` : null,
    `Wallet balance: ฿${num(p.walletBalance, 0).toLocaleString('en-US')}`,
    `KYC: ${p.kycStatus || 'unknown'}`,
    `Pending deposits: ${p.pendingDeposits} (฿${num(p.pendingDepositsThb, 0).toLocaleString('en-US')})`,
    '',
    'Recent financial events:',
  ].filter(Boolean);
  for (const it of p.recentItems || []) {
    lines.push(
      `- [${it.created_at || '?'}] ${it.category || it.source}: ${it.title}${it.detail ? ` — ${it.detail}` : ''}`,
    );
  }
  lines.push('', `Generated: ${new Date().toISOString()}`);
  return lines.join('\n');
}
