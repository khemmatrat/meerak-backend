/**
 * Growth Engine — viral milestones, entitlements, intent telemetry (Phase 0+)
 */

export const GROWTH_CAMPAIGNS = {
  TALENT_AI: 'talent_ai',
  MYSTERY_BOX: 'mystery_box',
};

const VALID_CAMPAIGNS = new Set(Object.values(GROWTH_CAMPAIGNS));
const MILESTONE_TARGET = 10;
const TALENT_AI_CREDITS_ON_UNLOCK = 2;

async function resolveUserId(pool, userId) {
  const r = await pool.query(
    `SELECT id, referral_code, wallet_balance, wallet_balance_withdrawable
     FROM users WHERE firebase_uid = $1 OR id::text = $1 LIMIT 1`,
    [userId],
  );
  return r.rows[0] || null;
}

export async function ensureEntitlements(pool, userId) {
  const user = await resolveUserId(pool, userId);
  if (!user) return null;

  await pool.query(
    `INSERT INTO growth_entitlements (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [user.id],
  );

  for (const campaign of VALID_CAMPAIGNS) {
    await pool.query(
      `INSERT INTO growth_referral_milestones (user_id, campaign, target_count)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, campaign) DO NOTHING`,
      [user.id, campaign, MILESTONE_TARGET],
    );
  }

  const ent = await pool.query(`SELECT * FROM growth_entitlements WHERE user_id = $1`, [user.id]);
  return { user, entitlements: ent.rows[0] };
}

/** Wallet "activated" = user opened internal ledger (balance initialized or explicit flag) */
export function isWalletActivated(userRow, entitlementsRow) {
  if (entitlementsRow?.wallet_activated_at) return true;
  const bal = userRow?.wallet_balance;
  const wd = userRow?.wallet_balance_withdrawable;
  return bal != null || wd != null;
}

export async function markWalletActivated(pool, userId) {
  const ctx = await ensureEntitlements(pool, userId);
  if (!ctx) return null;
  if (ctx.entitlements.wallet_activated_at) return ctx.entitlements;

  await pool.query(
    `UPDATE growth_entitlements SET wallet_activated_at = NOW(), updated_at = NOW()
     WHERE user_id = $1 AND wallet_activated_at IS NULL`,
    [ctx.user.id],
  );

  await syncReferralQualificationsForReferee(pool, ctx.user.id);
  const refreshed = await pool.query(`SELECT * FROM growth_entitlements WHERE user_id = $1`, [ctx.user.id]);
  return refreshed.rows[0];
}

/** When referee activates wallet, credit referrers for both campaigns */
export async function syncReferralQualificationsForReferee(pool, refereeUserId) {
  const ref = await pool.query(
    `SELECT referrer_id, referral_code FROM provider_referrals WHERE referred_id = $1 LIMIT 1`,
    [refereeUserId],
  );
  if (!ref.rows.length) return [];

  const { referrer_id: referrerId, referral_code: code } = ref.rows[0];
  const results = [];

  for (const campaign of VALID_CAMPAIGNS) {
    const ins = await pool.query(
      `INSERT INTO growth_referral_events (referrer_id, referee_id, campaign, referral_code)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (referrer_id, referee_id, campaign) DO NOTHING
       RETURNING id`,
      [referrerId, refereeUserId, campaign, code],
    );
    if (ins.rowCount === 0) continue;

    const cnt = await pool.query(
      `SELECT COUNT(*)::int AS c FROM growth_referral_events
       WHERE referrer_id = $1 AND campaign = $2`,
      [referrerId, campaign],
    );
    const qualified = cnt.rows[0]?.c || 0;

    await pool.query(
      `UPDATE growth_referral_milestones SET
         qualified_count = $3,
         updated_at = NOW(),
         unlocked_at = CASE WHEN $3 >= target_count AND unlocked_at IS NULL THEN NOW() ELSE unlocked_at END
       WHERE user_id = $1 AND campaign = $2`,
      [referrerId, campaign, qualified],
    );

    if (qualified >= MILESTONE_TARGET) {
      await grantCampaignReward(pool, referrerId, campaign);
    }
    results.push({ campaign, qualified });
  }
  return results;
}

async function grantCampaignReward(pool, userId, campaign) {
  const m = await pool.query(
    `SELECT reward_granted_at FROM growth_referral_milestones
     WHERE user_id = $1 AND campaign = $2`,
    [userId, campaign],
  );
  if (m.rows[0]?.reward_granted_at) return;

  if (campaign === GROWTH_CAMPAIGNS.TALENT_AI) {
    await pool.query(
      `UPDATE growth_entitlements SET
         ai_video_credits = ai_video_credits + $2,
         incubation_started_at = COALESCE(incubation_started_at, NOW()),
         updated_at = NOW()
       WHERE user_id = $1`,
      [userId, TALENT_AI_CREDITS_ON_UNLOCK],
    );
  } else if (campaign === GROWTH_CAMPAIGNS.MYSTERY_BOX) {
    await pool.query(
      `UPDATE growth_entitlements SET
         mystery_voucher_unlocked = TRUE,
         updated_at = NOW()
       WHERE user_id = $1`,
      [userId],
    );
  }

  await pool.query(
    `UPDATE growth_referral_milestones SET reward_granted_at = NOW(), updated_at = NOW()
     WHERE user_id = $1 AND campaign = $2`,
    [userId, campaign],
  );
}

export async function syncReferralMilestones(pool, userId) {
  const ctx = await ensureEntitlements(pool, userId);
  if (!ctx) return null;

  const refs = await pool.query(
    `SELECT pr.referred_id, pr.referral_code, u.wallet_balance, u.wallet_balance_withdrawable,
            ge.wallet_activated_at
     FROM provider_referrals pr
     JOIN users u ON u.id = pr.referred_id
     LEFT JOIN growth_entitlements ge ON ge.user_id = pr.referred_id
     WHERE pr.referrer_id = $1`,
    [ctx.user.id],
  );

  for (const row of refs.rows) {
    const activated =
      row.wallet_activated_at != null ||
      row.wallet_balance != null ||
      row.wallet_balance_withdrawable != null;
    if (activated) {
      await syncReferralQualificationsForReferee(pool, row.referred_id);
    }
  }

  return getGrowthStatus(pool, userId);
}

export async function getGrowthStatus(pool, userId) {
  const ctx = await ensureEntitlements(pool, userId);
  if (!ctx) return { found: false };

  const milestones = await pool.query(
    `SELECT campaign, target_count, qualified_count, unlocked_at, reward_granted_at
     FROM growth_referral_milestones WHERE user_id = $1 ORDER BY campaign`,
    [ctx.user.id],
  );

  const subs = await pool.query(
    `SELECT us.id, us.plan_id, us.status, us.trial_ends_at, us.current_period_end, sp.name_th, sp.price_thb
     FROM user_subscriptions us
     JOIN subscription_plans sp ON sp.id = us.plan_id
     WHERE us.user_id = $1 AND us.status IN ('trialing', 'active')
     ORDER BY us.created_at DESC LIMIT 3`,
    [ctx.user.id],
  );

  const e = ctx.entitlements;
  const aiRemaining = Math.max(0, (e.ai_video_credits || 0) - (e.ai_video_credits_used || 0));

  const milestoneMap = {};
  for (const row of milestones.rows) {
    milestoneMap[row.campaign] = {
      target: row.target_count,
      qualified: row.qualified_count,
      unlocked: !!row.unlocked_at,
      rewardGranted: !!row.reward_granted_at,
      progressPct: Math.min(100, Math.round((row.qualified_count / row.target_count) * 100)),
    };
  }

  return {
    found: true,
    userId: ctx.user.id,
    referralCode: ctx.user.referral_code,
    walletActivated: isWalletActivated(ctx.user, e),
    entitlements: {
      aiVideoCreditsRemaining: aiRemaining,
      aiVideoCreditsTotal: e.ai_video_credits || 0,
      aiVideoLocked: aiRemaining <= 0 && !milestoneMap[GROWTH_CAMPAIGNS.TALENT_AI]?.unlocked,
      mysteryVoucherUnlocked: !!e.mystery_voucher_unlocked,
      mysteryVoucherClaimed: !!e.mystery_voucher_claimed_at,
      incubationStartedAt: e.incubation_started_at,
      incubationWeek: e.incubation_week || 0,
      aqondPassPhase: e.aqond_pass_phase || 0,
      passExpiresAt: e.pass_expires_at,
      lockedSubsidyCategory: e.locked_subsidy_category,
    },
    milestones: milestoneMap,
    subscriptions: subs.rows,
    sharePath: ctx.user.referral_code ? `/register?ref=${ctx.user.referral_code}` : null,
  };
}

const ENTITY_TO_INTENT = {
  product: 'shop',
  shop_item: 'shop',
  menu_item: 'shop',
  course: 'shop',
  food: 'food',
  restaurant: 'food',
  menu: 'food',
  talent: 'talent',
  provider: 'talent',
  job: 'talent',
  service: 'talent',
};

function intentFromEntityType(entityType) {
  if (!entityType) return null;
  return ENTITY_TO_INTENT[String(entityType).toLowerCase()] || null;
}

const INTENT_BANNERS = {
  food: { title: 'สั่งอาหารตอนนี้', subtitle: 'ร้านใกล้คุณพร้อมส่ง', href: '/m/food' },
  shop: { title: 'ช้อปสิ่งที่คุณสนใจ', subtitle: 'แนะนำจากที่คุณดูบ่อย', href: '/m/home' },
  talent: { title: 'จ้างมืออาชีพใกล้บ้าน', subtitle: 'Matchjob พร้อมรับงาน', href: '/jobs' },
};

const MOBILE_INTENT_BANNERS = {
  food: { title: 'สั่งอาหารตอนนี้', subtitle: 'ร้านใกล้คุณพร้อมส่ง', href: '/marketplace' },
  shop: { title: 'ช้อปสิ่งที่คุณสนใจ', subtitle: 'แนะนำจากที่คุณดูบ่อย', href: '/marketplace' },
  talent: { title: 'จ้างมืออาชีพใกล้บ้าน', subtitle: 'จากความสนใจล่าสุดของคุณ', href: '/talents' },
};

export async function recordIntentEvents(pool, userId, events) {
  const user = await resolveUserId(pool, userId);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

  const list = Array.isArray(events) ? events : [];
  let inserted = 0;
  const now = new Date();
  const dow = now.getDay();
  const hour = now.getHours();
  let lastIntent = null;

  for (const ev of list) {
    const dwell = parseInt(ev.dwell_ms, 10);
    if (!ev.entity_type || !ev.entity_id || !Number.isFinite(dwell) || dwell < 5000) continue;
    await pool.query(
      `INSERT INTO user_intent_events (user_id, entity_type, entity_id, dwell_ms, surface)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, String(ev.entity_type).slice(0, 64), String(ev.entity_id).slice(0, 128), dwell, ev.surface || null],
    );
    inserted++;
    const inferred = intentFromEntityType(ev.entity_type);
    if (inferred) lastIntent = inferred;
  }

  if (lastIntent) {
    await pool.query(
      `INSERT INTO user_temporal_patterns (user_id, day_of_week, hour_bucket, open_count, dominant_intent, updated_at)
       VALUES ($1, $2, $3, 0, $4, NOW())
       ON CONFLICT (user_id, day_of_week, hour_bucket)
       DO UPDATE SET dominant_intent = EXCLUDED.dominant_intent, updated_at = NOW()`,
      [user.id, dow, hour, lastIntent],
    );
  }

  return { inserted };
}

export async function recordAppOpenPattern(pool, userId, { dominant_intent } = {}) {
  const user = await resolveUserId(pool, userId);
  if (!user) return null;
  const now = new Date();
  const dow = now.getDay();
  const hour = now.getHours();
  await pool.query(
    `INSERT INTO user_temporal_patterns (user_id, day_of_week, hour_bucket, open_count, dominant_intent, updated_at)
     VALUES ($1, $2, $3, 1, $4, NOW())
     ON CONFLICT (user_id, day_of_week, hour_bucket)
     DO UPDATE SET open_count = user_temporal_patterns.open_count + 1,
       dominant_intent = COALESCE(EXCLUDED.dominant_intent, user_temporal_patterns.dominant_intent),
       updated_at = NOW()`,
    [user.id, dow, hour, dominant_intent || null],
  );
  return { dayOfWeek: dow, hourBucket: hour };
}

export async function getPersonalizedHomeHints(pool, userId, { surface } = {}) {
  const user = await resolveUserId(pool, userId);
  if (!user) return { banner: null, intents: [] };

  const now = new Date();
  const dow = now.getDay();
  const hour = now.getHours();

  const pattern = await pool.query(
    `SELECT dominant_intent, open_count FROM user_temporal_patterns
     WHERE user_id = $1 AND day_of_week = $2 AND hour_bucket = $3`,
    [user.id, dow, hour],
  );

  const recent = await pool.query(
    `SELECT entity_type, entity_id, COUNT(*)::int AS hits, SUM(dwell_ms)::int AS dwell_total
     FROM user_intent_events
     WHERE user_id = $1 AND logged_at > NOW() - INTERVAL '7 days'
     GROUP BY entity_type, entity_id
     ORDER BY dwell_total DESC NULLS LAST, hits DESC LIMIT 5`,
    [user.id],
  );

  let dominantIntent = pattern.rows[0]?.dominant_intent || null;
  if (!dominantIntent) {
    for (const row of recent.rows) {
      const inferred = intentFromEntityType(row.entity_type);
      if (inferred) {
        dominantIntent = inferred;
        break;
      }
    }
  }

  const isMobile = String(surface || '').includes('mobile');
  const bannerMap = isMobile ? MOBILE_INTENT_BANNERS : INTENT_BANNERS;
  let banner =
    dominantIntent && bannerMap[dominantIntent]
      ? { ...bannerMap[dominantIntent] }
      : null;

  const top = recent.rows[0];
  if (banner && top?.entity_id) {
    const label =
      top.entity_type === 'talent' || top.entity_type === 'provider'
        ? 'ช่างที่คุณดูบ่อย'
        : top.entity_type === 'product'
          ? 'สินค้าที่คุณสนใจ'
          : 'จากพฤติกรรมล่าสุด';
    banner = { ...banner, subtitle: `${label} · แตะเพื่อดำเนินการต่อ` };
  }

  return {
    banner,
    intents: recent.rows,
    temporal: pattern.rows[0] || null,
    dominantIntent,
  };
}

export async function listSubscriptionPlans(pool) {
  const r = await pool.query(
    `SELECT id, name_th, price_thb, billing_interval, plan_type, features
     FROM subscription_plans WHERE active = TRUE ORDER BY price_thb`,
  );
  return r.rows;
}

export async function claimMysteryVoucher(pool, userId) {
  const ctx = await ensureEntitlements(pool, userId);
  if (!ctx) throw Object.assign(new Error('User not found'), { status: 404 });
  if (!ctx.entitlements.mystery_voucher_unlocked) {
    throw Object.assign(new Error('Mystery box not unlocked yet'), { status: 403 });
  }
  if (ctx.entitlements.mystery_voucher_claimed_at) {
    return { alreadyClaimed: true, claimedAt: ctx.entitlements.mystery_voucher_claimed_at };
  }
  await pool.query(
    `UPDATE growth_entitlements SET mystery_voucher_claimed_at = NOW(), updated_at = NOW() WHERE user_id = $1`,
    [ctx.user.id],
  );
  return {
    alreadyClaimed: false,
    voucher: { type: 'percent_off', value: 30, label: 'ส่วนลด 30% ทุกบริการ' },
  };
}
