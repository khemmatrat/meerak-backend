/**
 * Brand Adviser — config, fee-waiver eligibility (application layer), referral → reputation.
 * DB: migration 135 — users.is_brand_adviser, adviser_status, adviser_reputation_score,
 * brand_adviser_audit_log, brand_adviser_reputation_events, payout_config.brand_adviser_rules
 */

const DEFAULT_RULES = {
  program_enabled: false,
  inactivity_days: 30,
  warn_days_before_suspend: 3,
  admin_alert_days_before_suspend: 5,
  activity_requires_closed_job: true,
  referral_reputation_multiplier: 1,
};

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function mergeRules(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_RULES };
  return {
    ...DEFAULT_RULES,
    ...raw,
    program_enabled: Boolean(raw.program_enabled),
    inactivity_days: Math.max(1, parseInt(raw.inactivity_days, 10) || DEFAULT_RULES.inactivity_days),
    warn_days_before_suspend: Math.max(0, parseInt(raw.warn_days_before_suspend, 10) || DEFAULT_RULES.warn_days_before_suspend),
    admin_alert_days_before_suspend: Math.max(0, parseInt(raw.admin_alert_days_before_suspend, 10) || DEFAULT_RULES.admin_alert_days_before_suspend),
    activity_requires_closed_job: raw.activity_requires_closed_job !== false,
    referral_reputation_multiplier: Math.max(0, parseFloat(raw.referral_reputation_multiplier) ?? DEFAULT_RULES.referral_reputation_multiplier),
  };
}

/** @returns {Promise<object>} merged rules from payout_config.brand_adviser_rules */
export async function getBrandAdviserConfig(pool) {
  try {
    const r = await pool.query(
      `SELECT value_json FROM payout_config WHERE key = 'brand_adviser_rules'`
    );
    const j = r.rows?.[0]?.value_json;
    return mergeRules(typeof j === 'string' ? JSON.parse(j) : j || {});
  } catch (_) {
    return { ...DEFAULT_RULES };
  }
}

/** Raw BA columns for a user (single query). */
export async function getUserBrandAdviserRow(pool, userId) {
  if (!userId) return null;
  const r = await pool.query(
    `SELECT id, is_brand_adviser, adviser_status, adviser_reputation_score,
            adviser_public_slug, adviser_public_profile_enabled, adviser_granted_at,
            adviser_suspended_at, adviser_suspended_reason
     FROM users WHERE id::text = $1 OR id = $1::uuid
     LIMIT 1`,
    [String(userId)]
  );
  return r.rows?.[0] || null;
}

/**
 * True when program is on and user is enrolled BA with active status — platform commission may be waived (caller applies).
 */
export async function isPlatformCommissionWaivedForUser(pool, userId) {
  const cfg = await getBrandAdviserConfig(pool);
  if (!cfg.program_enabled) return false;
  const row = await getUserBrandAdviserRow(pool, userId);
  if (!row?.is_brand_adviser) return false;
  return String(row.adviser_status || '').toLowerCase() === 'active';
}

/**
 * Active BA must not receive cash referral bonus; award reputation instead (anti–double dipping).
 */
export async function shouldSkipCashReferralForReferrer(pool, referrerId) {
  return isPlatformCommissionWaivedForUser(pool, referrerId);
}

/**
 * @param {object} opts
 * @param {string} opts.referrerId
 * @param {string} opts.refereeId
 * @param {string} opts.jobId
 * @param {number} opts.grossAmount
 * @param {number} opts.commissionAmountWouldBe — same basis as referral cash would have been
 */
export async function awardReferralReputationForSkippedReferral(pool, opts) {
  const { referrerId, refereeId, jobId, grossAmount, commissionAmountWouldBe } = opts;
  if (!referrerId || !jobId) return;
  const cfg = await getBrandAdviserConfig(pool);
  const mult = cfg.referral_reputation_multiplier ?? 1;
  const pointsDelta = round2((Number(commissionAmountWouldBe) || 0) * mult);
  if (pointsDelta <= 0) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE users SET adviser_reputation_score = COALESCE(adviser_reputation_score, 0) + $1, updated_at = NOW()
       WHERE id::text = $2 OR id = $2::uuid`,
      [pointsDelta, String(referrerId)]
    );
    await client.query(
      `INSERT INTO brand_adviser_reputation_events (user_id, event_type, points_delta, referee_id, job_id, metadata)
       VALUES ($1, 'referral_cash_substitute', $2, $3::uuid, $4, $5::jsonb)`,
      [
        String(referrerId),
        pointsDelta,
        refereeId || null,
        String(jobId),
        JSON.stringify({
          gross_amount: grossAmount,
          commission_would_be: commissionAmountWouldBe,
          multiplier: mult,
        }),
      ]
    );
    await client.query('COMMIT');
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch (_) { }
    console.warn('[BrandAdviser] awardReferralReputationForSkippedReferral:', e?.message);
  } finally {
    client.release();
  }
}

/**
 * Append-only audit row (grant/suspend/cron — callers use actor_role Admin vs System vs Cron).
 */
export async function insertBrandAdviserAudit(pool, {
  userId,
  action,
  reason = null,
  metadata = {},
  actorId = 'system',
  actorRole = 'System',
}) {
  if (!userId || !action) return;
  try {
    await pool.query(
      `INSERT INTO brand_adviser_audit_log (user_id, actor_id, actor_role, action, reason, metadata)
       VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb)`,
      [String(userId), String(actorId), actorRole, action, reason, JSON.stringify(metadata || {})]
    );
  } catch (e) {
    console.warn('[BrandAdviser] insertBrandAdviserAudit:', e?.message);
  }
}

function msDays(d) {
  return d * 24 * 60 * 60 * 1000;
}

/** Latest completion time across match jobs, advance jobs, bookings (provider or employer side). */
export async function getLastClosedJobActivityAt(pool, userId) {
  const uid = String(userId);
  const r = await pool.query(
    `SELECT GREATEST(
        (SELECT MAX(j.paid_at) FROM jobs j WHERE j.status = 'completed' AND (j.accepted_by::text = $1 OR j.created_by::text = $1)),
        (SELECT MAX(aj.updated_at) FROM advance_jobs aj WHERE aj.status = 'completed' AND (aj.hired_user_id::text = $1 OR aj.employer_id::text = $1)),
        (SELECT MAX(b.updated_at) FROM bookings b WHERE b.status = 'completed' AND (b.talent_id::text = $1 OR b.booker_id::text = $1))
     ) AS t`,
    [uid]
  );
  const t = r.rows?.[0]?.t;
  return t ? new Date(t) : null;
}

/**
 * Date used to decide if BA is still "active" for fee waiver vs cron suspend.
 * When activity_requires_closed_job: only job completions count; else GREATEST(login, job).
 * Falls back to adviser_granted_at / created_at if no qualifying signal yet.
 */
export async function computeBaActivityReferenceDate(pool, userId, rules) {
  const uid = String(userId);
  const urow = await pool.query(
    `SELECT last_active_at, adviser_granted_at, created_at FROM users WHERE id::text = $1 OR id = $1::uuid LIMIT 1`,
    [uid]
  );
  const u = urow.rows?.[0];
  if (!u) return null;
  const lastJob = await getLastClosedJobActivityAt(pool, uid);
  const login = u.last_active_at ? new Date(u.last_active_at) : null;

  let ref = null;
  if (rules.activity_requires_closed_job) {
    ref = lastJob;
  } else {
    const times = [login, lastJob].filter(Boolean).map((d) => d.getTime());
    ref = times.length ? new Date(Math.max(...times)) : null;
  }

  const fallback = u.adviser_granted_at
    ? new Date(u.adviser_granted_at)
    : (u.created_at ? new Date(u.created_at) : null);
  if (!ref) return fallback;
  if (!fallback) return ref;
  return ref.getTime() > fallback.getTime() ? ref : fallback;
}

/**
 * Daily job: suspend BA where reference activity is older than inactivity_days.
 */
export async function runBrandAdviserActivityCron(pool) {
  const rules = await getBrandAdviserConfig(pool);
  if (!rules.program_enabled) {
    return { skipped: true, reason: 'program_disabled', suspended: 0, evaluated: 0 };
  }
  const days = rules.inactivity_days;
  const cutoff = Date.now() - msDays(days);
  const rows = await pool.query(
    `SELECT id FROM users WHERE is_brand_adviser = TRUE AND adviser_status = 'active'`
  );
  let suspended = 0;
  for (const row of rows.rows || []) {
    const refDate = await computeBaActivityReferenceDate(pool, row.id, rules);
    const refMs = refDate ? refDate.getTime() : 0;
    if (refMs >= cutoff) continue;

    const res = await pool.query(
      `UPDATE users SET adviser_status = 'suspended', adviser_suspended_at = NOW(),
         adviser_suspended_reason = $2, updated_at = NOW()
       WHERE id = $1 AND is_brand_adviser = TRUE AND adviser_status = 'active'`,
      [row.id, `inactivity_exceeded_${days}d`]
    );
    if ((res.rowCount || 0) < 1) continue;

    await insertBrandAdviserAudit(pool, {
      userId: row.id,
      action: 'auto_suspended_inactivity',
      reason: `No qualifying activity within ${days} days`,
      actorId: 'brand-adviser-cron',
      actorRole: 'Cron',
      metadata: { reference_activity_at: refDate?.toISOString() || null, inactivity_days: days },
    });
    suspended++;
  }
  return { suspended, evaluated: rows.rows?.length || 0, inactivity_days: days };
}

/** Payload merged into GET /api/users/profile for mobile (badges, warnings). */
export async function getBrandAdviserProfilePayload(pool, userId) {
  const cfg = await getBrandAdviserConfig(pool);
  const row = await getUserBrandAdviserRow(pool, userId);
  const base = {
    brand_adviser_program_enabled: cfg.program_enabled,
    is_brand_adviser: !!(row?.is_brand_adviser),
    adviser_status: row?.adviser_status || null,
    adviser_reputation_score: row?.adviser_reputation_score != null ? parseFloat(row.adviser_reputation_score) : 0,
    adviser_public_slug: row?.adviser_public_slug || null,
    adviser_public_profile_enabled: !!(row?.adviser_public_profile_enabled),
    adviser_granted_at: row?.adviser_granted_at
      ? new Date(row.adviser_granted_at).toISOString()
      : null,
    adviser_suspended_at: row?.adviser_suspended_at
      ? new Date(row.adviser_suspended_at).toISOString()
      : null,
    adviser_suspended_reason: row?.adviser_suspended_reason || null,
    brand_adviser_activity_reference_at: null,
    estimated_suspend_at: null,
    days_until_suspend_estimate: null,
    brand_adviser_suspend_warning: false,
  };
  if (!row?.is_brand_adviser || !cfg.program_enabled) return base;

  const refDate = await computeBaActivityReferenceDate(pool, userId, cfg);
  base.brand_adviser_activity_reference_at = refDate ? refDate.toISOString() : null;

  if (String(row.adviser_status || '').toLowerCase() === 'active') {
    if (refDate) {
      const suspendAt = new Date(refDate.getTime() + msDays(cfg.inactivity_days));
      base.estimated_suspend_at = suspendAt.toISOString();
      const msLeft = suspendAt.getTime() - Date.now();
      const daysLeft = Math.ceil(msLeft / msDays(1));
      base.days_until_suspend_estimate = Math.max(0, daysLeft);
      const warnDays = cfg.warn_days_before_suspend;
      base.brand_adviser_suspend_warning =
        warnDays > 0 && daysLeft > 0 && daysLeft <= warnDays;
    }
  }
  return base;
}

async function sendFcmToUserBa(pool, userId, title, body) {
  const r = await pool.query(
    `SELECT token FROM fcm_tokens WHERE user_id = $1::uuid AND token IS NOT NULL AND token != ''`,
    [String(userId)]
  ).catch(() => ({ rows: [] }));
  const tokens = (r.rows || []).map((x) => x.token).filter(Boolean);
  if (tokens.length === 0) return { success: 0, failed: 0 };
  const { sendFcmMulticast } = await import('./fcmService.js');
  return sendFcmMulticast(tokens, { title, body, icon: '/logo.png' });
}

async function isPeaceMode(pool, userId) {
  const r = await pool.query(
    'SELECT is_peace_mode FROM users WHERE id::text = $1 OR id = $1::uuid LIMIT 1',
    [String(userId)]
  ).catch(() => ({ rows: [] }));
  return !!r.rows?.[0]?.is_peace_mode;
}

/**
 * FCM แจ้งเตือนก่อนถูกพักสิทธิ์ — ไม่เกิน 1 ครั้งต่อ 36 ชม. ต่อ user (dedup ใน audit).
 * เรียกต่อ cron รายวันก่อน runBrandAdviserActivityCron
 */
export async function runBrandAdviserSuspendWarnings(pool) {
  const rules = await getBrandAdviserConfig(pool);
  if (!rules.program_enabled) return { warned: 0, skipped: true };
  const warnDays = rules.warn_days_before_suspend;
  if (warnDays <= 0) return { warned: 0, skipped: true, reason: 'warn_disabled' };

  const rows = await pool.query(
    `SELECT id FROM users WHERE is_brand_adviser = TRUE AND adviser_status = 'active'`
  );
  let warned = 0;
  for (const row of rows.rows || []) {
    const refDate = await computeBaActivityReferenceDate(pool, row.id, rules);
    if (!refDate) continue;
    const suspendAt = new Date(refDate.getTime() + msDays(rules.inactivity_days));
    const msLeft = suspendAt.getTime() - Date.now();
    const daysLeft = Math.ceil(msLeft / msDays(1));
    if (daysLeft <= 0 || daysLeft > warnDays) continue;

    const dup = await pool.query(
      `SELECT 1 FROM brand_adviser_audit_log
       WHERE user_id = $1 AND action = 'warn_before_suspend'
       AND created_at > NOW() - INTERVAL '36 hours' LIMIT 1`,
      [row.id]
    );
    if (dup.rows?.length) continue;
    if (await isPeaceMode(pool, row.id)) continue;

    const title = 'Brand Adviser — ใกล้ถึงกำหนดเคลื่อนไหว';
    const body = `อีกประมาณ ${daysLeft} วัน สิทธิ์ยกเว้นค่าธรรมเนียมอาจถูกพัก — เข้าแอปหรือปิดงานเพื่อรักษาสถานะ`;
    await sendFcmToUserBa(pool, row.id, title, body);
    await insertBrandAdviserAudit(pool, {
      userId: row.id,
      action: 'warn_before_suspend',
      reason: `days_left=${daysLeft}`,
      actorId: 'brand-adviser-cron',
      actorRole: 'Cron',
      metadata: { days_left: daysLeft, estimated_suspend_at: suspendAt.toISOString() },
    });
    warned++;
  }
  return { warned, evaluated: rows.rows?.length || 0 };
}
