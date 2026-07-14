/**
 * Brand Adviser Grand Prize campaign
 * - Incremental purchase events + qualification (min purchase OR repeat hire on different days)
 * - Snapshot-backed leaderboard (grand / week / velocity)
 * - Reconcile from purchase events for audit
 */

const DEFAULT_CAMPAIGN = {
  enabled: true,
  campaign_name: 'Brand Adviser Grand Prize',
  start_at: '2026-06-06T00:00:00+07:00',
  end_at: '2026-12-30T23:59:59+07:00',
  min_purchase_thb: 100,
  repeat_hire_min_days_apart: 1,
  terms_and_conditions: [
    'ผู้ชนะอันดับ 1 สูงสุดเมื่อสิ้นสุดแคมเปญ (30 ธ.ค. 2026) ได้รางวัลตาม tier สูงสุดที่ถึง',
    'นับเฉพาะ user ที่สมัครผ่านรหัสแนะนำและจัดซื้อบริการครบเงื่อนไขภายในช่วงแคมเปญ',
    'จัดซื้อบริการ ≥ 100 บาทต่อรายการ หรือจ้างซ้ำ ≥ 2 ครั้ง (คนละวัน)',
    'บริษัทขอสิทธิ์ตรวจสอบ KYC และธุรกรรมย้อนหลังก่อนมอบรางวัล',
    'โปรแกรมเงินคืน 1.5% (7 วัน) เป็นโปรแยก — ไม่เกี่ยวกับการนับ user แคมเปญนี้',
  ],
  milestones: [
    {
      target: 70000,
      label: 'รางวัลที่ 3',
      prize: 'Honda PCX 160 Roadsync 2025 + เงินสด 20,000 บาท',
    },
    {
      target: 200000,
      label: 'รางวัลที่ 2',
      prize: 'Mercedes-Benz GLA 200 AMG Dynamic + เงินสด 100,000 บาท',
    },
    {
      target: 500000,
      label: 'รางวัลที่ 1',
      prize: 'BMW X1 sDrive20i M Sport 2026 + เงินสด 500,000 บาท',
    },
  ],
};

const TIER_BADGES = [
  { id: 'diamond', min: 200000, label: 'Diamond' },
  { id: 'platinum', min: 70000, label: 'Platinum' },
  { id: 'gold', min: 10000, label: 'Gold' },
  { id: 'silver', min: 1000, label: 'Silver' },
  { id: 'bronze', min: 0, label: 'Bronze' },
];

let _tablesChecked = null;

async function campaignTablesReady(pool) {
  if (_tablesChecked !== null) return _tablesChecked;
  try {
    const r = await pool.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'brand_adviser_qualified_users' LIMIT 1`,
    );
    _tablesChecked = !!r.rows?.length;
  } catch {
    _tablesChecked = false;
  }
  return _tablesChecked;
}

/** @param {import('pg').Pool} pool */
async function loadBrandAdviserCampaignConfig(pool) {
  try {
    const r = await pool.query(
      `SELECT value_json FROM payout_config WHERE key = 'brand_adviser_campaign' LIMIT 1`,
    );
    const raw = r.rows?.[0]?.value_json;
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_CAMPAIGN };
    return {
      ...DEFAULT_CAMPAIGN,
      ...raw,
      milestones: Array.isArray(raw.milestones) && raw.milestones.length
        ? raw.milestones
        : DEFAULT_CAMPAIGN.milestones,
      terms_and_conditions: Array.isArray(raw.terms_and_conditions)
        ? raw.terms_and_conditions
        : DEFAULT_CAMPAIGN.terms_and_conditions,
    };
  } catch {
    return { ...DEFAULT_CAMPAIGN };
  }
}

function campaignWindow(config) {
  const start = config.start_at ? new Date(config.start_at) : new Date(DEFAULT_CAMPAIGN.start_at);
  const end = config.end_at ? new Date(config.end_at) : new Date(DEFAULT_CAMPAIGN.end_at);
  const minThb = Math.max(0, Number(config.min_purchase_thb ?? DEFAULT_CAMPAIGN.min_purchase_thb));
  return { start, end, minThb };
}

function isCampaignActive(config, at = new Date()) {
  if (!config?.enabled) return false;
  const { start, end } = campaignWindow(config);
  const t = at.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

function tierBadgeForCount(count) {
  const n = Number(count) || 0;
  for (const t of TIER_BADGES) {
    if (n >= t.min) return t;
  }
  return TIER_BADGES[TIER_BADGES.length - 1];
}

function bangkokDayKey(d) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(d));
  } catch {
    return new Date(d).toISOString().slice(0, 10);
  }
}

function evaluateQualificationFromEvents(events, minThb) {
  const evs = events || [];
  for (const ev of evs) {
    const gross = parseFloat(ev.gross_amount) || 0;
    if (gross >= minThb) {
      return {
        qualifyReason: 'min_purchase',
        qualifiedAt: ev.done_at,
        triggerGross: gross,
        sourceType: ev.source_type,
        sourceId: ev.source_id,
      };
    }
  }
  if (evs.length >= 2) {
    const days = new Set(evs.map((e) => bangkokDayKey(e.done_at)));
    if (days.size >= 2) {
      const second = evs[1];
      return {
        qualifyReason: 'repeat_hire',
        qualifiedAt: second.done_at,
        triggerGross: parseFloat(second.gross_amount) || 0,
        sourceType: second.source_type,
        sourceId: second.source_id,
      };
    }
  }
  return null;
}

/** @param {import('pg').Pool} pool */
async function refreshReferrerSnapshot(pool, referrerId) {
  if (!(await campaignTablesReady(pool))) return null;
  const r = await pool.query(
    `INSERT INTO brand_adviser_referrer_snapshots (referrer_id, qualifying_count, week_new_count, prev_week_count, updated_at)
     SELECT $1::uuid,
       (SELECT COUNT(*)::int FROM brand_adviser_qualified_users WHERE referrer_id = $1::uuid),
       (SELECT COUNT(*)::int FROM brand_adviser_qualified_users
        WHERE referrer_id = $1::uuid AND qualified_at >= date_trunc('week', NOW())),
       (SELECT COUNT(*)::int FROM brand_adviser_qualified_users
        WHERE referrer_id = $1::uuid
          AND qualified_at >= date_trunc('week', NOW()) - INTERVAL '7 days'
          AND qualified_at < date_trunc('week', NOW())),
       NOW()
     ON CONFLICT (referrer_id) DO UPDATE SET
       qualifying_count = EXCLUDED.qualifying_count,
       week_new_count = EXCLUDED.week_new_count,
       prev_week_count = EXCLUDED.prev_week_count,
       updated_at = NOW()
     RETURNING *`,
    [referrerId],
  );
  return r.rows?.[0] || null;
}

/** @param {import('pg').Pool} pool */
async function recordCampaignBuyerPurchase(
  pool,
  { buyerId, sourceType, sourceId, grossAmount, completedAt = new Date() },
) {
  const config = await loadBrandAdviserCampaignConfig(pool);
  if (!config.enabled || !isCampaignActive(config, completedAt)) {
    return { recorded: false, reason: 'campaign_inactive' };
  }
  if (!(await campaignTablesReady(pool))) {
    return { recorded: false, reason: 'tables_missing' };
  }

  const buyer = String(buyerId || '').trim();
  const srcId = String(sourceId || '').trim();
  const srcType = String(sourceType || '').trim();
  if (!buyer || !srcId || !srcType) return { recorded: false, reason: 'invalid_input' };

  const gross = Math.max(0, parseFloat(grossAmount) || 0);
  if (gross <= 0) return { recorded: false, reason: 'zero_gross' };

  const refRow = await pool.query(
    `SELECT referrer_id FROM provider_referrals WHERE referred_id::text = $1 LIMIT 1`,
    [buyer],
  );
  if (!refRow.rows?.length) return { recorded: false, reason: 'not_referred' };
  const referrerId = refRow.rows[0].referrer_id;

  const { start, end, minThb } = campaignWindow(config);
  const doneAt = new Date(completedAt);
  if (doneAt < start || doneAt > end) return { recorded: false, reason: 'outside_window' };

  await pool.query(
    `INSERT INTO brand_adviser_purchase_events
       (referrer_id, referred_id, source_type, source_id, gross_amount, done_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (source_type, source_id) DO NOTHING`,
    [referrerId, buyer, srcType, srcId, gross, doneAt.toISOString()],
  );

  const existing = await pool.query(
    `SELECT 1 FROM brand_adviser_qualified_users
     WHERE referrer_id = $1 AND referred_id = $2 LIMIT 1`,
    [referrerId, buyer],
  );
  if (existing.rows?.length) {
    return { recorded: true, alreadyQualified: true, referrerId: String(referrerId) };
  }

  const events = await pool.query(
    `SELECT source_type, source_id, gross_amount, done_at
     FROM brand_adviser_purchase_events
     WHERE referrer_id = $1 AND referred_id = $2
     ORDER BY done_at ASC`,
    [referrerId, buyer],
  );

  const qual = evaluateQualificationFromEvents(events.rows, minThb);
  if (!qual) {
    return { recorded: true, qualified: false, referrerId: String(referrerId) };
  }

  const ins = await pool.query(
    `INSERT INTO brand_adviser_qualified_users
       (referrer_id, referred_id, qualified_at, qualify_reason, source_type, source_id, gross_trigger)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (referrer_id, referred_id) DO NOTHING
     RETURNING id`,
    [
      referrerId,
      buyer,
      qual.qualifiedAt,
      qual.qualifyReason,
      qual.sourceType,
      qual.sourceId,
      qual.triggerGross,
    ],
  );

  const newlyQualified = !!ins.rows?.length;
  if (newlyQualified) {
    await refreshReferrerSnapshot(pool, referrerId);
    await scanCampaignFraudForPair(pool, referrerId, buyer).catch(() => { });
  }

  return {
    recorded: true,
    qualified: newlyQualified,
    newlyQualified,
    referrerId: String(referrerId),
    qualifyReason: qual.qualifyReason,
  };
}

/** @param {import('pg').Pool} pool */
async function scanCampaignFraudForPair(pool, referrerId, referredId) {
  if (!(await campaignTablesReady(pool))) return;

  const sameBank = await pool.query(
    `SELECT 1 FROM payout_requests p1
     JOIN payout_requests p2 ON p2.user_id = $2
     WHERE p1.user_id = $1
       AND p1.status IN ('approved','pending')
       AND p2.status IN ('approved','pending')
       AND COALESCE(p1.bank_details->>'account_number', p1.bank_details->>'accountNumber') IS NOT NULL
       AND COALESCE(p1.bank_details->>'account_number', p1.bank_details->>'accountNumber') =
           COALESCE(p2.bank_details->>'account_number', p2.bank_details->>'accountNumber')
     LIMIT 1`,
    [referrerId, referredId],
  );
  if (sameBank.rows?.length) {
    await pool.query(
      `INSERT INTO brand_adviser_campaign_fraud_flags (referrer_id, referred_id, flag_type, detail)
       VALUES ($1, $2, 'same_bank_account', $3)`,
      [referrerId, referredId, JSON.stringify({ note: 'Referrer and referee share bank account on payout' })],
    );
  }

  const burst = await pool.query(
    `SELECT COUNT(*)::int AS c FROM brand_adviser_qualified_users
     WHERE referrer_id = $1 AND qualified_at >= NOW() - INTERVAL '1 hour'`,
    [referrerId],
  );
  if ((burst.rows?.[0]?.c || 0) >= 20) {
    await pool.query(
      `INSERT INTO brand_adviser_campaign_fraud_flags (referrer_id, referred_id, flag_type, detail)
       VALUES ($1, $2, 'qualify_burst', $3)`,
      [referrerId, referredId, JSON.stringify({ count_last_hour: burst.rows[0].c })],
    );
  }
}

async function reconcileCampaignSnapshots(pool) {
  if (!(await campaignTablesReady(pool))) return { rebuilt: 0 };
  await pool.query(
    `INSERT INTO brand_adviser_referrer_snapshots (referrer_id, qualifying_count, week_new_count, prev_week_count, updated_at)
     SELECT q.referrer_id,
       COUNT(*)::int,
       COUNT(*) FILTER (WHERE q.qualified_at >= date_trunc('week', NOW()))::int,
       COUNT(*) FILTER (
         WHERE q.qualified_at >= date_trunc('week', NOW()) - INTERVAL '7 days'
           AND q.qualified_at < date_trunc('week', NOW())
       )::int,
       NOW()
     FROM brand_adviser_qualified_users q
     GROUP BY q.referrer_id
     ON CONFLICT (referrer_id) DO UPDATE SET
       qualifying_count = EXCLUDED.qualifying_count,
       week_new_count = EXCLUDED.week_new_count,
       prev_week_count = EXCLUDED.prev_week_count,
       updated_at = NOW()`,
  );
  const c = await pool.query(`SELECT COUNT(*)::int AS c FROM brand_adviser_referrer_snapshots`);
  return { rebuilt: c.rows?.[0]?.c || 0 };
}

function qualifyingUsersCte(minThb) {
  return `
    referred AS (
      SELECT pr.referrer_id, pr.referred_id, pr.referred_at FROM provider_referrals pr
    ),
    purchases AS (
      SELECT r.referrer_id, r.referred_id AS buyer_id, j.id AS src_id, 'job' AS src_type,
        GREATEST(0, COALESCE(NULLIF((j.payment_details->>'final_price')::numeric, 0),
          NULLIF((j.payment_details->>'total_paid')::numeric, 0), NULLIF(j.price::numeric, 0), 0))::numeric AS gross,
        COALESCE(j.paid_at, j.updated_at, j.created_at) AS done_at
      FROM referred r
      INNER JOIN jobs j ON COALESCE(j.client_id, j.created_by)::text = r.referred_id::text
      WHERE j.status = 'completed'
        AND (j.payment_status = 'paid' OR j.paid_at IS NOT NULL OR (j.payment_details->>'paid') = 'true')
        AND COALESCE(j.paid_at, j.updated_at, j.created_at) >= $1::timestamptz
        AND COALESCE(j.paid_at, j.updated_at, j.created_at) <= $2::timestamptz
      UNION ALL
      SELECT r.referrer_id, r.referred_id, aj.id::text, 'advance_job',
        GREATEST(0, COALESCE(aj.escrow_amount, aj.max_budget, 0))::numeric,
        COALESCE(aj.updated_at, aj.created_at)
      FROM referred r
      INNER JOIN advance_jobs aj ON aj.employer_id::text = r.referred_id::text
      WHERE aj.status = 'completed'
        AND COALESCE(aj.updated_at, aj.created_at) >= $1::timestamptz
        AND COALESCE(aj.updated_at, aj.created_at) <= $2::timestamptz
      UNION ALL
      SELECT r.referrer_id, r.referred_id, b.id::text, 'booking',
        GREATEST(0, COALESCE(b.deposit_amount, 0))::numeric,
        COALESCE(b.updated_at, b.created_at)
      FROM referred r
      INNER JOIN bookings b ON b.booker_id::text = r.referred_id::text
      WHERE b.status = 'completed'
        AND COALESCE(b.updated_at, b.created_at) >= $1::timestamptz
        AND COALESCE(b.updated_at, b.created_at) <= $2::timestamptz
    ),
    ranked AS (
      SELECT referrer_id, buyer_id, gross, done_at,
        ROW_NUMBER() OVER (PARTITION BY referrer_id, buyer_id ORDER BY done_at ASC) AS rn
      FROM purchases WHERE gross > 0
    ),
    qual_events AS (
      SELECT referrer_id, buyer_id, done_at AS qualified_at FROM ranked WHERE gross >= $3::numeric
      UNION ALL
      SELECT referrer_id, buyer_id, done_at FROM ranked WHERE rn = 2
    ),
    qualifying AS (
      SELECT referrer_id, buyer_id, MIN(qualified_at) AS qualified_at
      FROM qual_events GROUP BY referrer_id, buyer_id
    )
  `;
}

async function getSnapshotLeaderboard(pool, limit, board) {
  let orderSql = 's.qualifying_count DESC, u.full_name ASC NULLS LAST';
  if (board === 'week') {
    orderSql = 's.week_new_count DESC, s.qualifying_count DESC';
  } else if (board === 'velocity') {
    orderSql =
      '(s.week_new_count::float / GREATEST(1, s.qualifying_count - s.week_new_count)) DESC, s.week_new_count DESC';
  }

  const r = await pool.query(
    `SELECT u.id, u.full_name, u.phone, u.referral_code,
            s.qualifying_count, s.week_new_count, s.prev_week_count
     FROM brand_adviser_referrer_snapshots s
     INNER JOIN users u ON u.id = s.referrer_id
     WHERE u.referral_code IS NOT NULL AND s.qualifying_count > 0
     ORDER BY ${orderSql}
     LIMIT $1`,
    [limit],
  );
  return (r.rows || []).map((row, idx) => ({
    rank: idx + 1,
    userId: String(row.id),
    fullName: row.full_name || row.phone || '—',
    referralCode: row.referral_code,
    qualifyingUsers: row.qualifying_count || 0,
    weekNew: row.week_new_count || 0,
    tierBadge: tierBadgeForCount(row.qualifying_count || 0),
  }));
}

/** @param {import('pg').Pool} pool */
async function getCampaignLeaderboard(pool, limit = 20, config, board = 'grand') {
  if (await campaignTablesReady(pool)) {
    const snapCount = await pool.query(
      `SELECT COUNT(*)::int AS c FROM brand_adviser_referrer_snapshots WHERE qualifying_count > 0`,
    );
    if ((snapCount.rows?.[0]?.c || 0) > 0) {
      return getSnapshotLeaderboard(pool, limit, board);
    }
  }

  const { start, end, minThb } = campaignWindow(config);
  const cte = qualifyingUsersCte(minThb);
  let orderSql = 'qualifying_users DESC';
  if (board === 'week') orderSql = 'week_new DESC, qualifying_users DESC';

  const r = await pool.query(
    `WITH ${cte},
     agg AS (
       SELECT referrer_id, COUNT(*)::int AS qualifying_users,
         COUNT(*) FILTER (WHERE qualified_at >= NOW() - INTERVAL '7 days')::int AS week_new
       FROM qualifying GROUP BY referrer_id
     )
     SELECT u.id, u.full_name, u.phone, u.referral_code, a.qualifying_users, a.week_new
     FROM agg a
     INNER JOIN users u ON u.id = a.referrer_id
     WHERE u.referral_code IS NOT NULL
     ORDER BY ${orderSql}, u.full_name ASC NULLS LAST
     LIMIT $4`,
    [start.toISOString(), end.toISOString(), minThb, limit],
  );
  return (r.rows || []).map((row, idx) => ({
    rank: idx + 1,
    userId: String(row.id),
    fullName: row.full_name || row.phone || '—',
    referralCode: row.referral_code,
    qualifyingUsers: row.qualifying_users || 0,
    weekNew: row.week_new || 0,
    tierBadge: tierBadgeForCount(row.qualifying_users || 0),
  }));
}

/** @param {import('pg').Pool} pool */
async function getReferrerRankInfo(pool, referrerId) {
  if (!(await campaignTablesReady(pool))) {
    return { rank: null, totalParticipants: 0, percentile: null, gapToFirst: null, firstPlaceCount: 0 };
  }
  const [rankRes, totalRes, firstRes, meRes] = await Promise.all([
    pool.query(
      `SELECT rk FROM (
         SELECT referrer_id, RANK() OVER (ORDER BY qualifying_count DESC, updated_at ASC) AS rk
         FROM brand_adviser_referrer_snapshots WHERE qualifying_count > 0
       ) x WHERE referrer_id = $1::uuid`,
      [referrerId],
    ),
    pool.query(
      `SELECT COUNT(*)::int AS c FROM brand_adviser_referrer_snapshots WHERE qualifying_count > 0`,
    ),
    pool.query(
      `SELECT qualifying_count FROM brand_adviser_referrer_snapshots ORDER BY qualifying_count DESC LIMIT 1`,
    ),
    pool.query(
      `SELECT qualifying_count FROM brand_adviser_referrer_snapshots WHERE referrer_id = $1::uuid`,
      [referrerId],
    ),
  ]);
  const rank = rankRes.rows?.[0]?.rk ? parseInt(rankRes.rows[0].rk, 10) : null;
  const total = totalRes.rows?.[0]?.c || 0;
  const myCount = meRes.rows?.[0]?.qualifying_count || 0;
  const firstCount = firstRes.rows?.[0]?.qualifying_count || 0;
  let percentile = null;
  if (rank && total > 0) percentile = Math.max(1, Math.round((rank / total) * 100));
  return {
    rank: myCount > 0 ? rank : null,
    totalParticipants: total,
    percentile: myCount > 0 ? percentile : null,
    gapToFirst: myCount > 0 ? Math.max(0, firstCount - myCount) : firstCount,
    firstPlaceCount: firstCount,
  };
}

/** @param {import('pg').Pool} pool */
async function getCampaignStatsForReferrer(pool, referrerId, config) {
  let qualifyingUsers = 0;
  let qualifyingThisWeek = 0;

  if (await campaignTablesReady(pool)) {
    const snap = await pool.query(
      `SELECT qualifying_count, week_new_count FROM brand_adviser_referrer_snapshots WHERE referrer_id = $1`,
      [referrerId],
    );
    if (snap.rows?.length) {
      qualifyingUsers = snap.rows[0].qualifying_count || 0;
      qualifyingThisWeek = snap.rows[0].week_new_count || 0;
    } else {
      const c = await pool.query(
        `SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE qualified_at >= date_trunc('week', NOW()))::int AS week_c
         FROM brand_adviser_qualified_users WHERE referrer_id = $1`,
        [referrerId],
      );
      qualifyingUsers = c.rows?.[0]?.total || 0;
      qualifyingThisWeek = c.rows?.[0]?.week_c || 0;
    }
  } else {
    const { start, end, minThb } = campaignWindow(config);
    const cte = qualifyingUsersCte(minThb);
    const r = await pool.query(
      `WITH ${cte}
       SELECT COUNT(*)::int AS qualifying_users,
         COUNT(*) FILTER (WHERE qualified_at >= date_trunc('week', NOW()))::int AS qualifying_this_week
       FROM qualifying WHERE referrer_id = $4::uuid`,
      [start.toISOString(), end.toISOString(), minThb, referrerId],
    );
    qualifyingUsers = r.rows?.[0]?.qualifying_users || 0;
    qualifyingThisWeek = r.rows?.[0]?.qualifying_this_week || 0;
  }

  const milestones = (config.milestones || DEFAULT_CAMPAIGN.milestones)
    .slice()
    .sort((a, b) => a.target - b.target);
  let nextMilestone = null;
  for (const m of milestones) {
    if (qualifyingUsers < m.target) {
      nextMilestone = { ...m, remaining: m.target - qualifyingUsers };
      break;
    }
  }
  const highestReached = [...milestones].reverse().find((m) => qualifyingUsers >= m.target) || null;
  const rankInfo = await getReferrerRankInfo(pool, referrerId);

  return {
    qualifyingUsers,
    qualifyingThisWeek,
    nextMilestone,
    highestReached,
    milestones,
    tierBadge: tierBadgeForCount(qualifyingUsers),
    ...rankInfo,
  };
}

async function getCampaignGrowthSeries(pool, referrerId, config, maxPoints = 90) {
  if (await campaignTablesReady(pool)) {
    const r = await pool.query(
      `SELECT date_trunc('day', qualified_at AT TIME ZONE 'Asia/Bangkok')::date AS day,
              COUNT(*)::int AS new_users
       FROM brand_adviser_qualified_users
       WHERE referrer_id = $1
       GROUP BY 1 ORDER BY 1`,
      [referrerId],
    );
    let cumulative = 0;
    const series = (r.rows || []).map((row) => {
      cumulative += row.new_users || 0;
      return {
        date: row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day).slice(0, 10),
        newUsers: row.new_users || 0,
        totalUsers: cumulative,
      };
    });
    return series.length > maxPoints ? series.slice(series.length - maxPoints) : series;
  }

  const { start, end, minThb } = campaignWindow(config);
  const cte = qualifyingUsersCte(minThb);
  const r = await pool.query(
    `WITH ${cte},
     daily AS (
       SELECT date_trunc('day', qualified_at AT TIME ZONE 'Asia/Bangkok')::date AS day,
              COUNT(*)::int AS new_users
       FROM qualifying WHERE referrer_id = $4::uuid GROUP BY 1 ORDER BY 1
     )
     SELECT day, new_users FROM daily`,
    [start.toISOString(), end.toISOString(), minThb, referrerId],
  );
  let cumulative = 0;
  const series = (r.rows || []).map((row) => {
    cumulative += row.new_users || 0;
    return {
      date: row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day).slice(0, 10),
      newUsers: row.new_users || 0,
      totalUsers: cumulative,
    };
  });
  return series.length > maxPoints ? series.slice(series.length - maxPoints) : series;
}

async function getPlatformCampaignStats(pool, config) {
  const { minThb, end } = campaignWindow(config);
  const countdownSeconds = Math.max(0, Math.floor((end.getTime() - Date.now()) / 1000));

  if (!(await campaignTablesReady(pool))) {
    return {
      totalQualifyingUsers: 0,
      totalReferrers: 0,
      projectedGmvMin: 0,
      projectedGmvFromEvents: 0,
      countdownSeconds,
      podium: [],
    };
  }

  const [qRes, rRes, gmv, podium] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS qu FROM brand_adviser_qualified_users`),
    pool.query(`SELECT COUNT(*)::int AS ref FROM brand_adviser_referrer_snapshots WHERE qualifying_count > 0`),
    pool.query(`SELECT COALESCE(SUM(gross_amount), 0)::numeric AS gmv FROM brand_adviser_purchase_events`),
    getSnapshotLeaderboard(pool, 3, 'grand'),
  ]);

  const totalQu = qRes.rows?.[0]?.qu || 0;
  return {
    totalQualifyingUsers: totalQu,
    totalReferrers: rRes.rows?.[0]?.ref || 0,
    projectedGmvMin: totalQu * minThb,
    projectedGmvFromEvents: parseFloat(gmv.rows?.[0]?.gmv || 0),
    countdownSeconds,
    podium,
  };
}

async function getCampaignFraudFlags(pool, limit = 50) {
  if (!(await campaignTablesReady(pool))) return [];
  const r = await pool.query(
    `SELECT id, referrer_id, referred_id, flag_type, detail, created_at
     FROM brand_adviser_campaign_fraud_flags
     WHERE resolved = FALSE ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return (r.rows || []).map((row) => ({
    id: String(row.id),
    referrerId: row.referrer_id ? String(row.referrer_id) : null,
    referredId: row.referred_id ? String(row.referred_id) : null,
    flagType: row.flag_type,
    detail: row.detail,
    createdAt: row.created_at,
  }));
}

function publicCampaignPayload(config) {
  const { start, end, minThb } = campaignWindow(config);
  return {
    enabled: !!config.enabled,
    active: isCampaignActive(config),
    campaignName: config.campaign_name || DEFAULT_CAMPAIGN.campaign_name,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    minPurchaseThb: minThb,
    countdownSeconds: Math.max(0, Math.floor((end.getTime() - Date.now()) / 1000)),
    prizeModel: 'top_one_at_end',
    milestones: (config.milestones || DEFAULT_CAMPAIGN.milestones).map((m) => ({
      target: m.target,
      label: m.label || '',
      prize: m.prize || '',
    })),
    termsAndConditions: config.terms_and_conditions || DEFAULT_CAMPAIGN.terms_and_conditions,
    rulesSummary:
      'นับ user ที่สมัครผ่านรหัสของคุณ เมื่อจัดซื้อบริการ ≥ ขั้นต่ำต่อรายการ หรือจ้างซ้ำ (คนละวัน) — สะสมได้ตลอดช่วงแคมเปญจนถึงวันสิ้นสุด',
    noteCashReferral:
      'โปรแกรมเงินคืน 1.5% แยกต่างหาก — จ่ายเฉพาะงานที่เพื่อนทำ (provider) ภายใน 7 วันแรกจากงานแรก',
  };
}

export {
  DEFAULT_CAMPAIGN,
  TIER_BADGES,
  loadBrandAdviserCampaignConfig,
  isCampaignActive,
  campaignWindow,
  tierBadgeForCount,
  recordCampaignBuyerPurchase,
  refreshReferrerSnapshot,
  reconcileCampaignSnapshots,
  getCampaignStatsForReferrer,
  getCampaignLeaderboard,
  getCampaignGrowthSeries,
  getPlatformCampaignStats,
  getCampaignFraudFlags,
  getReferrerRankInfo,
  publicCampaignPayload,
  campaignTablesReady,
};
