/**
 * Community Challenge — เป้าหมายร่วม (ออนไลน์ / จ้างงาน / งานสำเร็จ) เก็บใน system_settings.community_challenge
 */

export const DEFAULT_COMMUNITY_CHALLENGE = {
  enabled: false,
  titleTh: 'Community Challenge',
  titleEn: 'Community Challenge',
  subtitleTh: 'ร่วมกันทำเป้าหมาย — ปลดล็อกรางวัลและโค้ด',
  subtitleEn: 'Reach targets together — unlock rewards & codes',
  onlineWindowMinutes: 15,
  /** ISO string หรือ null = นับตั้งแต่เริ่มระบบ */
  periodStart: null,
  periodEnd: null,
  targetOnlineUsers: 1000,
  /** งานที่โพสต์ (Match + Advance) ในช่วง */
  targetJobsPosted: 500,
  /** งานที่มีคนรับ (มีผู้รับงานแล้ว) */
  targetHires: 400,
  /** งานที่ส่งมอบสำเร็จ */
  targetCompleted: 300,
  rewardTitleTh: 'รางวัลเมื่อครบเป้าหมาย',
  rewardTitleEn: 'Rewards when targets are met',
  rewardDescriptionTh: 'โค้ดส่วนลด รถยนต์ ทองคำ มอเตอร์ไซค์ — ตามที่ประกาศ',
  rewardDescriptionEn: 'Promo codes, car, gold, motorcycle — as announced',
  employerNoteTh: 'ฝั่งผู้จ้าง: โพสต์งาน · จ้างงานสำเร็จ',
  employerNoteEn: 'Employers: post jobs · successful hires',
  providerNoteTh: 'ฝั่งผู้ให้บริการ: รับงาน · ส่งมอบสำเร็จ',
  providerNoteEn: 'Providers: accept jobs · complete deliveries',
};

function mergeConfig(raw) {
  const p = raw && typeof raw === 'object' ? raw : {};
  return { ...DEFAULT_COMMUNITY_CHALLENGE, ...p };
}

export async function getCommunityChallengeConfig(pool) {
  try {
    const r = await pool.query(`SELECT value FROM system_settings WHERE key = 'community_challenge'`).catch(() => ({ rows: [] }));
    const raw = r?.rows?.[0]?.value;
    if (raw) {
      try {
        return mergeConfig(JSON.parse(raw));
      } catch (_) {}
    }
  } catch (_) {}
  return { ...DEFAULT_COMMUNITY_CHALLENGE };
}

async function safeCount(pool, sql, params) {
  try {
    const r = await pool.query(sql, params);
    const c = r.rows?.[0]?.c ?? r.rows?.[0]?.count;
    return parseInt(String(c ?? 0), 10) || 0;
  } catch (_) {
    return 0;
  }
}

function periodParams(periodStart, periodEnd) {
  const p = [];
  let clause = '';
  if (periodStart) {
    p.push(periodStart);
    clause += ` AND created_at >= $${p.length}`;
  }
  if (periodEnd) {
    p.push(periodEnd);
    clause += ` AND created_at <= $${p.length}`;
  }
  return { clause, params: p };
}

function periodParamsUpdated(periodStart, periodEnd) {
  const p = [];
  let clause = '';
  if (periodStart) {
    p.push(periodStart);
    clause += ` AND updated_at >= $${p.length}`;
  }
  if (periodEnd) {
    p.push(periodEnd);
    clause += ` AND updated_at <= $${p.length}`;
  }
  return { clause, params: p };
}

/**
 * @returns {Promise<{ config: object, stats: object }>}
 */
export async function getCommunityChallengeSnapshot(pool) {
  const config = await getCommunityChallengeConfig(pool);
  const windowMin = Math.min(120, Math.max(1, parseInt(config.onlineWindowMinutes, 10) || 15));

  const { clause: pClause, params: pParams } = periodParams(config.periodStart, config.periodEnd);
  const { clause: uClause, params: uParams } = periodParamsUpdated(config.periodStart, config.periodEnd);

  const onlineSql = `
    SELECT COUNT(*)::int AS c FROM users
    WHERE COALESCE(last_active_at, last_login, updated_at) > NOW() - (interval '1 minute' * $1::int)
  `;
  const onlineUsers = await safeCount(pool, onlineSql, [windowMin]);

  const jobsPosted =
    (await safeCount(
      pool,
      `SELECT COUNT(*)::int AS c FROM jobs WHERE 1=1 ${pClause}`,
      pParams,
    )) +
    (await safeCount(
      pool,
      `SELECT COUNT(*)::int AS c FROM advance_jobs WHERE 1=1 ${pClause}`,
      pParams,
    ));

  const hiresMatch = await safeCount(
    pool,
    `SELECT COUNT(*)::int AS c FROM jobs WHERE accepted_by IS NOT NULL ${pClause}`,
    pParams,
  );
  const hiresAdvance = await safeCount(
    pool,
    `SELECT COUNT(*)::int AS c FROM advance_jobs WHERE hired_user_id IS NOT NULL ${pClause}`,
    pParams,
  );
  const hiresTotal = hiresMatch + hiresAdvance;

  const completedMatch = await safeCount(
    pool,
    `SELECT COUNT(*)::int AS c FROM jobs WHERE LOWER(TRIM(COALESCE(status::text, ''))) = 'completed' ${uClause}`,
    uParams,
  );
  const completedAdvance = await safeCount(
    pool,
    `SELECT COUNT(*)::int AS c FROM advance_jobs WHERE status::text = 'completed' ${uClause}`,
    uParams,
  );
  const completedTotal = completedMatch + completedAdvance;

  const tOn = Math.max(0, parseInt(config.targetOnlineUsers, 10) || 0);
  const tPost = Math.max(0, parseInt(config.targetJobsPosted, 10) || 0);
  const tHire = Math.max(0, parseInt(config.targetHires, 10) || 0);
  const tDone = Math.max(0, parseInt(config.targetCompleted, 10) || 0);

  const pct = (cur, tgt) => (tgt > 0 ? Math.min(100, Math.round((cur / tgt) * 1000) / 10) : 0);

  const allMet =
    (!tOn || onlineUsers >= tOn) &&
    (!tPost || jobsPosted >= tPost) &&
    (!tHire || hiresTotal >= tHire) &&
    (!tDone || completedTotal >= tDone);

  const stats = {
    onlineUsers,
    jobsPosted,
    hiresTotal,
    completedTotal,
    hiresMatch,
    hiresAdvance,
    completedMatch,
    completedAdvance,
    progress: {
      onlinePct: pct(onlineUsers, tOn),
      postedPct: pct(jobsPosted, tPost),
      hiresPct: pct(hiresTotal, tHire),
      completedPct: pct(completedTotal, tDone),
    },
    targets: {
      onlineUsers: tOn,
      jobsPosted: tPost,
      hires: tHire,
      completed: tDone,
    },
    allTargetsMet: allMet,
    onlineWindowMinutes: windowMin,
  };

  return { config, stats };
}
