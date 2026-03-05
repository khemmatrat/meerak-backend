/**
 * Referral Service — แนะนำเพื่อน (configurable %)
 * จ่าย % ของ Gross Job Value ให้ referrer เมื่อ referee ทำงานจบภายใน 7 วัน นับจากงานแรก
 * Budget-aware: Circuit Breaker — ไม่จ่ายถ้างบ marketing_budgets ไม่พอ
 */

const DEFAULT_REFERRAL_RATE = 0.015;

/** Get active campaign budget and rate */
async function getActiveBudget(pool) {
  try {
    const r = await pool.query(
      `SELECT id, campaign_name, total_allocated, total_spent, commission_rate_pct, is_active
       FROM marketing_budgets WHERE is_active = true ORDER BY created_at DESC LIMIT 1`
    );
    const row = r.rows?.[0];
    if (!row) return null;
  const available = parseFloat(row.total_allocated || 0) - parseFloat(row.total_spent || 0);
    return {
      id: row.id,
      campaignName: row.campaign_name,
      totalAllocated: parseFloat(row.total_allocated || 0),
      totalSpent: parseFloat(row.total_spent || 0),
      availableBalance: available,
      commissionRatePct: parseFloat(row.commission_rate_pct || 1.5),
      rate: parseFloat(row.commission_rate_pct || 1.5) / 100,
      isActive: !!row.is_active,
    };
  } catch (e) {
    return null;
  }
}

function generateReferralCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** Ensure user has unique referral_code */
async function ensureReferralCode(pool, userId) {
  const row = await pool.query(
    'SELECT referral_code FROM users WHERE id = $1',
    [userId]
  );
  if (!row.rows?.length) return null;
  let code = row.rows[0].referral_code;
  if (code) return code;
  for (let i = 0; i < 10; i++) {
    code = generateReferralCode();
    try {
      await pool.query(
        'UPDATE users SET referral_code = $1 WHERE id = $2 AND (referral_code IS NULL OR referral_code = $1)',
        [code, userId]
      );
      const check = await pool.query('SELECT 1 FROM users WHERE referral_code = $1 AND id != $2', [code, userId]);
      if (!check.rows?.length) return code;
    } catch (_) {}
  }
  return null;
}

/** Resolve referral code to user id */
async function resolveCodeToUserId(pool, code) {
  if (!code || typeof code !== 'string') return null;
  const c = code.trim().toUpperCase();
  const r = await pool.query('SELECT id FROM users WHERE UPPER(referral_code) = $1', [c]);
  return r.rows?.[0]?.id || null;
}

/** Record referral on signup: ref=code in query/body */
async function recordReferralOnSignup(pool, refereeId, referralCode) {
  const referrerId = await resolveCodeToUserId(pool, referralCode);
  if (!referrerId || String(referrerId) === String(refereeId)) return;
  try {
    await pool.query(
      `INSERT INTO provider_referrals (referrer_id, referred_id, referral_code)
       VALUES ($1, $2, $3)
       ON CONFLICT (referrer_id, referred_id) DO NOTHING`,
      [referrerId, refereeId, referralCode.trim().toUpperCase()]
    );
  } catch (e) {
    console.warn('[Referral] recordReferralOnSignup:', e?.message);
  }
}

/** Get first_job_at for referee — when they completed their first job */
async function getRefereeFirstJobAt(pool, refereeId) {
  const r = await pool.query(
    `SELECT first_job_at FROM provider_referrals WHERE referred_id = $1 AND first_job_at IS NOT NULL ORDER BY first_job_at ASC LIMIT 1`,
    [refereeId]
  );
  return r.rows?.[0]?.first_job_at || null;
}

/** Set first_job_at when referee completes first job */
async function setRefereeFirstJobAt(pool, refereeId, at = new Date()) {
  await pool.query(
    `UPDATE provider_referrals SET first_job_at = $2 WHERE referred_id = $1 AND first_job_at IS NULL`,
    [refereeId, at]
  );
}

/** Check if job completion is within 7-day window for referral bonus */
function isWithinReferralWindow(firstJobAt, jobCompletedAt) {
  if (!firstJobAt) return false;
  const first = new Date(firstJobAt).getTime();
  const job = new Date(jobCompletedAt).getTime();
  const windowMs = 7 * 24 * 60 * 60 * 1000;
  return job >= first && job <= first + windowMs;
}

/** Process referral payout: configurable % of gross when conditions met. Circuit Breaker: skip if budget exhausted. */
async function processReferralPayout(pool, refereeId, jobId, grossAmount, jobCompletedAt) {
  if (!refereeId || !jobId || !(grossAmount > 0)) return;
  try {
    const budget = await getActiveBudget(pool);
    const rate = budget ? budget.rate : DEFAULT_REFERRAL_RATE;
    const budgetId = budget?.id || null;
    if (budget && !budget.isActive) return;

    const refRow = await pool.query(
      `SELECT referrer_id, first_job_at FROM provider_referrals WHERE referred_id = $1`,
      [refereeId]
    );
    if (!refRow.rows?.length) return;
    const { referrer_id: referrerId, first_job_at: firstJobAt } = refRow.rows[0];

    if (!firstJobAt) return;
    if (!isWithinReferralWindow(firstJobAt, jobCompletedAt)) return;

    const commissionAmount = Math.round(grossAmount * rate * 100) / 100;
    if (commissionAmount <= 0) return;

    const exists = await pool.query(
      'SELECT 1 FROM referral_earnings WHERE job_id = $1 AND referrer_id = $2',
      [jobId, referrerId]
    );
    if (exists.rows?.length) return;

    // Circuit Breaker: งบไม่พอ → log + queue pending, ไม่จ่าย (เฉพาะเมื่อมี marketing_budgets)
    if (budget && budget.availableBalance < commissionAmount) {
      const ledgerId = `L-REF-EXH-${jobId}-${referrerId}-${Date.now()}`;
      await pool.query(
        `INSERT INTO payment_ledger_audit (id, event_type, payment_id, gateway, job_id, amount, currency, status, bill_no, transaction_no, user_id, metadata)
         VALUES ($1, 'referral_budget_exhausted', $2, 'wallet', $2, $3, 'THB', 'pending', $4, $5, $6, $7)`,
        [ledgerId, jobId, commissionAmount, `REF-EXH-${jobId}`, `T-REF-EXH-${jobId}-${Date.now()}`, referrerId,
          JSON.stringify({ leg: 'referral_budget_exhausted', referee_id: refereeId, gross_amount: grossAmount, rate, available: budget.availableBalance, expense_category: 'MARKETING_EXPENSE' })]
      ).catch((e) => console.warn('[Referral] ledger exhaust:', e?.message));
      await pool.query(
        `INSERT INTO referral_pending_payouts (referrer_id, referee_id, job_id, gross_amount, commission_amount)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (job_id, referrer_id) DO NOTHING`,
        [referrerId, refereeId, jobId, grossAmount, commissionAmount]
      ).catch((e) => console.warn('[Referral] pending insert:', e?.message));
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (budget) {
        await client.query(
          `UPDATE marketing_budgets SET total_spent = total_spent + $1, updated_at = NOW() WHERE id = $2`,
          [commissionAmount, budget.id]
        );
      }

      await client.query(
        `UPDATE users SET wallet_balance = wallet_balance + $1, updated_at = NOW() WHERE id = $2`,
        [commissionAmount, referrerId]
      );

      const ledgerId = `L-REF-${jobId}-${referrerId}-${Date.now()}`;
      await client.query(
        `INSERT INTO payment_ledger_audit (id, event_type, payment_id, gateway, job_id, amount, currency, status, bill_no, transaction_no, user_id, metadata)
         VALUES ($1, 'referral_bonus', $2, 'wallet', $2, $3, 'THB', 'completed', $4, $5, $6, $7)`,
        [ledgerId, jobId, commissionAmount, `REF-${jobId}`, `T-REF-${jobId}-${Date.now()}`, referrerId,
          JSON.stringify({ leg: 'referral_bonus', referee_id: refereeId, gross_amount: grossAmount, rate, budget_id: budgetId, expense_category: 'MARKETING_EXPENSE' })]
      );

      await client.query(
        `INSERT INTO referral_earnings (referrer_id, referee_id, job_id, gross_amount, commission_amount, ledger_id, budget_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [referrerId, refereeId, jobId, grossAmount, commissionAmount, ledgerId, budgetId]
      );

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.warn('[Referral] processReferralPayout:', e?.message);
  }
}

/** On job completion: ensure first_job_at set, then process payout */
async function onJobCompleted(pool, refereeId, jobId, grossAmount, completedAt = new Date()) {
  try {
    const refRow = await pool.query(
      `SELECT id, first_job_at FROM provider_referrals WHERE referred_id = $1`,
      [refereeId]
    );
    if (!refRow.rows?.length) return;

    const row = refRow.rows[0];
    let firstJobAt = row.first_job_at;

    if (!firstJobAt) {
      await setRefereeFirstJobAt(pool, refereeId, completedAt);
      firstJobAt = completedAt;
    }

    await processReferralPayout(pool, refereeId, jobId, grossAmount, completedAt);
  } catch (e) {
    console.warn('[Referral] onJobCompleted:', e?.message);
  }
}

/** Get referral stats for user */
async function getReferralStats(pool, userId) {
  const [counts, earned] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE first_job_at IS NOT NULL)::int AS active
       FROM provider_referrals WHERE referrer_id = $1`,
      [userId]
    ),
    pool.query(
      `SELECT COALESCE(SUM(commission_amount), 0)::numeric AS t FROM referral_earnings WHERE referrer_id = $1`,
      [userId]
    ),
  ]);
  return {
    totalReferrals: counts.rows?.[0]?.total || 0,
    activeWorkers: counts.rows?.[0]?.active || 0,
    totalEarned: parseFloat(earned.rows?.[0]?.t || 0),
  };
}

/** Leaderboard: top referrers this week (by earned) */
async function getLeaderboard(pool, limit = 10) {
  const r = await pool.query(
    `WITH ref_counts AS (
       SELECT referrer_id, COUNT(*)::int AS cnt FROM provider_referrals GROUP BY referrer_id
     ),
     week_earnings AS (
       SELECT referrer_id, COALESCE(SUM(commission_amount), 0)::numeric AS amt
       FROM referral_earnings
       WHERE created_at >= date_trunc('week', NOW())
       GROUP BY referrer_id
     )
     SELECT u.id, u.full_name, u.phone, u.referral_code,
            COALESCE(rc.cnt, 0)::int AS referral_count,
            COALESCE(we.amt, 0)::numeric AS earned_this_week
     FROM users u
     JOIN ref_counts rc ON rc.referrer_id = u.id
     LEFT JOIN week_earnings we ON we.referrer_id = u.id
     WHERE u.referral_code IS NOT NULL AND rc.cnt > 0
     ORDER BY earned_this_week DESC NULLS LAST, referral_count DESC
     LIMIT $1`,
    [limit]
  );
  return (r.rows || []).map((row) => ({
    userId: String(row.id),
    fullName: row.full_name || row.phone || '—',
    referralCode: row.referral_code,
    referralCount: row.referral_count || 0,
    earnedThisWeek: parseFloat(row.earned_this_week || 0),
  }));
}

/** Process pending payouts when budget has been topped up (Admin trigger) */
async function processPendingPayouts(pool, limit = 50) {
  const budget = await getActiveBudget(pool);
  if (!budget || !budget.isActive || budget.availableBalance <= 0) return { processed: 0 };

  const pending = await pool.query(
    `SELECT id, referrer_id, referee_id, job_id, gross_amount, commission_amount
     FROM referral_pending_payouts WHERE status = 'pending' AND commission_amount <= $1
     ORDER BY created_at ASC LIMIT $2`,
    [budget.availableBalance, limit]
  );
  let processed = 0;
  for (const row of pending.rows || []) {
    if (budget.availableBalance < parseFloat(row.commission_amount)) break;
    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `UPDATE marketing_budgets SET total_spent = total_spent + $1, updated_at = NOW() WHERE id = $2`,
          [row.commission_amount, budget.id]
        );
        await client.query(
          `UPDATE users SET wallet_balance = wallet_balance + $1, updated_at = NOW() WHERE id = $2`,
          [row.commission_amount, row.referrer_id]
        );
        const ledgerId = `L-REF-${row.job_id}-${row.referrer_id}-${Date.now()}`;
        await client.query(
          `INSERT INTO payment_ledger_audit (id, event_type, payment_id, gateway, job_id, amount, currency, status, bill_no, transaction_no, user_id, metadata)
           VALUES ($1, 'referral_bonus', $2, 'wallet', $2, $3, 'THB', 'completed', $4, $5, $6, $7)`,
          [ledgerId, row.job_id, row.commission_amount, `REF-${row.job_id}`, `T-REF-${row.job_id}-${Date.now()}`, row.referrer_id,
            JSON.stringify({ leg: 'referral_bonus', referee_id: row.referee_id, gross_amount: row.gross_amount, budget_id: budget.id, expense_category: 'MARKETING_EXPENSE', from_pending: true })]
        );
        await client.query(
          `INSERT INTO referral_earnings (referrer_id, referee_id, job_id, gross_amount, commission_amount, ledger_id, budget_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [row.referrer_id, row.referee_id, row.job_id, row.gross_amount, row.commission_amount, ledgerId, budget.id]
        );
        await client.query(
          `UPDATE referral_pending_payouts SET status = 'processed', processed_at = NOW() WHERE id = $1`,
          [row.id]
        );
        await client.query('COMMIT');
        processed++;
        budget.availableBalance -= parseFloat(row.commission_amount);
      } catch (e) {
        await client.query('ROLLBACK');
        break;
      } finally {
        client.release();
      }
    } catch (e) {
      console.warn('[Referral] processPending:', e?.message);
      break;
    }
  }
  return { processed };
}

export {
  ensureReferralCode,
  resolveCodeToUserId,
  recordReferralOnSignup,
  getRefereeFirstJobAt,
  setRefereeFirstJobAt,
  onJobCompleted,
  processReferralPayout,
  processPendingPayouts,
  getReferralStats,
  getLeaderboard,
  getActiveBudget,
  DEFAULT_REFERRAL_RATE as REFERRAL_RATE,
};
