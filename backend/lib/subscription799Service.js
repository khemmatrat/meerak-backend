/**
 * Growth Pro 799 THB — talent + merchant subscription checkout & funnel analytics
 */

import { ensureEntitlements } from './growthEngine.js';

export const PRO_799_PLAN_IDS = ['talent_pro_799', 'merchant_marketing_799'];

export const PRO_799_PLANS = {
  talent_pro_799: {
    id: 'talent_pro_799',
    nameTh: 'Talent Pro — AI Director + Video Resume',
    priceThb: 799,
    planType: 'talent',
    features: [
      'AI Director + Overlay ไม่จำกัด',
      'วิดีโอ Resume โปรโมทในฟีด',
      'Analytics รายสัปดาห์',
    ],
  },
  merchant_marketing_799: {
    id: 'merchant_marketing_799',
    nameTh: 'Merchant Marketing — AI Promo Generator',
    priceThb: 799,
    planType: 'merchant',
    features: [
      'โปรโมท AI รายสัปดาห์',
      'สิทธิ์เข้า Top 10 Merchant',
      'Analytics exposure ร้าน',
    ],
  },
};

async function resolveUserId(pool, userId) {
  const r = await pool.query(
    `SELECT id, wallet_balance, wallet_balance_withdrawable, primary_intent
     FROM users WHERE firebase_uid = $1 OR id::text = $1 LIMIT 1`,
    [userId],
  );
  return r.rows[0] || null;
}

export async function ensureGrowthSubscriptionSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS growth_subscription_orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan_id VARCHAR(64) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'active', 'failed', 'cancelled')),
      amount_baht NUMERIC(12, 2) NOT NULL DEFAULT 0,
      payment_method VARCHAR(40),
      payment_ref VARCHAR(200),
      paid_at TIMESTAMPTZ,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => {});
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_growth_sub_orders_user ON growth_subscription_orders (user_id, created_at DESC)`,
  ).catch(() => {});
}

export function estimatePlanExposure(planId, context = {}) {
  const base = planId === 'merchant_marketing_799' ? 3200 : 4800;
  const intentBoost = context.dominantIntent ? 1.12 : 1;
  const passBoost = (context.aqondPassPhase || 0) >= 4 ? 1.18 : 1;
  const incubationBoost = context.incubationComplete ? 1.1 : 1;
  const monthlyImpressions = Math.round(base * intentBoost * passBoost * incubationBoost);
  const revenuePotentialThb = Math.round(
    monthlyImpressions * (planId === 'merchant_marketing_799' ? 0.35 : 0.22),
  );
  const label =
    planId === 'talent_pro_799'
      ? 'การมองเห็นใน Video Feed + Matchjob'
      : 'Top 10 carousel + AI promo slots';
  return {
    monthlyImpressions,
    revenuePotentialThb,
    label,
    message:
      planId === 'talent_pro_799'
        ? `เพิ่มช่องทางโชว์ ~${monthlyImpressions.toLocaleString('th-TH')} ครั้ง/เดือน — มูลค่า exposure ประมาณ ฿${revenuePotentialThb.toLocaleString('th-TH')}`
        : `เพิ่ม exposure ร้าน ~${monthlyImpressions.toLocaleString('th-TH')} ครั้ง/เดือน — มูลค่าโปรโมชันโดยประมาณ ฿${revenuePotentialThb.toLocaleString('th-TH')}`,
  };
}

function inferVariant(user, entitlements, subs) {
  const activeMerchant = subs.some(
    (s) => s.plan_id === 'merchant_marketing_799' && s.status === 'active',
  );
  const activeTalent = subs.some(
    (s) => s.plan_id === 'talent_pro_799' && s.status === 'active',
  );
  if (activeMerchant && !activeTalent) return 'merchant';
  if (activeTalent && !activeMerchant) return 'talent';
  const intent = String(user?.primary_intent || '').toLowerCase();
  if (intent === 'shop' || intent === 'merchant' || intent === 'food') return 'merchant';
  return 'talent';
}

export async function getUpsell799Status(pool, userId) {
  const user = await resolveUserId(pool, userId);
  if (!user) return { found: false };

  await ensureGrowthSubscriptionSchema(pool);
  const ctx = await ensureEntitlements(pool, userId);
  const e = ctx?.entitlements;

  const subs = await pool.query(
    `SELECT us.id, us.plan_id, us.status, us.current_period_end, sp.name_th, sp.price_thb, sp.plan_type
     FROM user_subscriptions us
     JOIN subscription_plans sp ON sp.id = us.plan_id
     WHERE us.user_id = $1 AND us.plan_id = ANY($2::varchar[])
     ORDER BY us.created_at DESC`,
    [user.id, PRO_799_PLAN_IDS],
  );

  const activeSubs = subs.rows.filter((s) => s.status === 'active');
  const variant = inferVariant(user, e, subs.rows);
  const planId = variant === 'merchant' ? 'merchant_marketing_799' : 'talent_pro_799';
  const plan = PRO_799_PLANS[planId];

  const incubationComplete =
    !!e?.incubation_started_at &&
    (e.incubation_week || 0) >= 13;

  const exposureContext = {
    dominantIntent: user.primary_intent,
    aqondPassPhase: e?.aqond_pass_phase || 0,
    incubationComplete,
  };

  const walletBalance = parseFloat(user.wallet_balance || 0);

  return {
    found: true,
    variant,
    plan,
    plans: Object.values(PRO_799_PLANS),
    activeSubscriptions: activeSubs,
    hasActive799: activeSubs.length > 0,
    walletBalance,
    canPayWithWallet: walletBalance >= plan.priceThb,
    exposure: estimatePlanExposure(planId, exposureContext),
    trialEnded: incubationComplete || (e?.aqond_pass_phase || 0) >= 6,
    entitlements: {
      incubationWeek: e?.incubation_week || 0,
      aqondPassPhase: e?.aqond_pass_phase || 0,
      aiCreditsRemaining: Math.max(
        0,
        (e?.ai_video_credits || 0) - (e?.ai_video_credits_used || 0),
      ),
    },
  };
}

async function grantPlanBenefits(client, userId, planId) {
  if (planId === 'talent_pro_799') {
    await client.query(
      `UPDATE growth_entitlements SET
         ai_video_credits = GREATEST(COALESCE(ai_video_credits, 0), 24),
         metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
         updated_at = NOW()
       WHERE user_id = $1`,
      [
        userId,
        JSON.stringify({
          pro799_talent: true,
          unlimited_overlay: true,
          pro799_activated_at: new Date().toISOString(),
        }),
      ],
    );
  } else {
    await client.query(
      `UPDATE growth_entitlements SET
         metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
         updated_at = NOW()
       WHERE user_id = $1`,
      [
        userId,
        JSON.stringify({
          pro799_merchant: true,
          top10_eligible: true,
          pro799_activated_at: new Date().toISOString(),
        }),
      ],
    );
  }
}

async function activateSubscription(client, userId, planId, orderId, paymentRef) {
  await client.query(
    `UPDATE user_subscriptions SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
     WHERE user_id = $1 AND plan_id = $2 AND status IN ('trialing', 'active')`,
    [userId, planId],
  );

  const periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const sub = await client.query(
    `INSERT INTO user_subscriptions (user_id, plan_id, status, current_period_end, metadata)
     VALUES ($1, $2, 'active', $3, $4::jsonb)
     RETURNING *`,
    [
      userId,
      planId,
      periodEnd.toISOString(),
      JSON.stringify({ order_id: orderId, payment_ref: paymentRef }),
    ],
  );

  await grantPlanBenefits(client, userId, planId);
  return sub.rows[0];
}

export async function checkoutSubscription799(pool, userId, planId, opts = {}) {
  const plan = PRO_799_PLANS[planId];
  if (!plan) {
    throw Object.assign(new Error('planId ต้องเป็น talent_pro_799 หรือ merchant_marketing_799'), {
      status: 400,
    });
  }

  const user = await resolveUserId(pool, userId);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

  await ensureGrowthSubscriptionSchema(pool);

  const existing = await pool.query(
    `SELECT id FROM user_subscriptions
     WHERE user_id = $1 AND plan_id = $2 AND status = 'active' LIMIT 1`,
    [user.id, planId],
  );
  if (existing.rows[0]) {
    const status = await getUpsell799Status(pool, userId);
    return {
      success: true,
      alreadyActive: true,
      status: 'active',
      planId,
      subscription: existing.rows[0],
      exposure: status.exposure,
    };
  }

  const paymentMethod = opts.payment_method || 'wallet';
  const amount = plan.priceThb;

  if (paymentMethod === 'wallet') {
    const balance = parseFloat(user.wallet_balance || 0);
    if (balance < amount) {
      throw Object.assign(new Error('ยอดเงินในกระเป๋าไม่พอ'), {
        status: 400,
        code: 'INSUFFICIENT_WALLET',
        required: amount,
        balance,
      });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const orderRes = await client.query(
      `INSERT INTO growth_subscription_orders
         (user_id, plan_id, status, amount_baht, payment_method, metadata)
       VALUES ($1, $2, 'processing', $3, $4, $5::jsonb)
       RETURNING *`,
      [
        user.id,
        planId,
        amount,
        paymentMethod,
        JSON.stringify({ source: opts.source || 'upsell799' }),
      ],
    );
    const order = orderRes.rows[0];
    const paymentRef = opts.payment_ref || `pro799-${order.id}`;

    if (paymentMethod === 'wallet') {
      await client.query(
        `UPDATE users SET wallet_balance = GREATEST(0, COALESCE(wallet_balance, 0) - $1), updated_at = NOW()
         WHERE id = $2`,
        [amount, user.id],
      );
      const ledgerId = `L-pro799-${order.id}`;
      await client.query(
        `INSERT INTO payment_ledger_audit
           (id, event_type, payment_id, gateway, amount, currency, status, user_id, metadata)
         VALUES ($1, 'vip_subscription', $2, 'wallet', $3, 'THB', 'completed', $4, $5::jsonb)
         ON CONFLICT (id) DO NOTHING`,
        [
          ledgerId,
          paymentRef,
          amount,
          user.id,
          JSON.stringify({ plan_id: planId, growth_order_id: order.id, leg: 'pro799' }),
        ],
      ).catch(() => {});
    }

    const subscription = await activateSubscription(
      client,
      user.id,
      planId,
      order.id,
      paymentRef,
    );

    await client.query(
      `UPDATE growth_subscription_orders SET
         status = 'active', paid_at = NOW(), payment_ref = $2, updated_at = NOW()
       WHERE id = $1`,
      [order.id, paymentRef],
    );

    await client.query('COMMIT');

    const exposure = estimatePlanExposure(planId, {
      aqondPassPhase: opts.aqondPassPhase,
      incubationComplete: opts.incubationComplete,
    });

    return {
      success: true,
      status: 'active',
      orderId: order.id,
      planId,
      amount,
      subscription,
      exposure,
      message: `เปิดใช้ ${plan.nameTh} แล้ว`,
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function getGrowthConversionFunnel(pool, { rangeDays = 30 } = {}) {
  const days = Math.max(1, Math.min(Number(rangeDays) || 30, 365));
  const since = new Date();
  since.setDate(since.getDate() - days);

  const [
    entitlements,
    talentMilestone,
    mysteryMilestone,
    aiVideoUsers,
    videoJobs,
    talentSubs,
    merchantSubs,
    passActive,
    mysteryUnlocked,
    mysteryClaimed,
    revenue,
    recentOrders,
  ] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS c FROM growth_entitlements`),
    pool.query(
      `SELECT COUNT(*)::int AS c FROM growth_referral_milestones
       WHERE campaign = 'talent_ai' AND unlocked_at IS NOT NULL`,
    ),
    pool.query(
      `SELECT COUNT(*)::int AS c FROM growth_referral_milestones
       WHERE campaign = 'mystery_box' AND unlocked_at IS NOT NULL`,
    ),
    pool.query(`SELECT COUNT(DISTINCT user_id)::int AS c FROM talent_video_jobs`),
    pool.query(`SELECT COUNT(*)::int AS c FROM talent_video_jobs WHERE created_at >= $1`, [
      since.toISOString(),
    ]),
    pool.query(
      `SELECT COUNT(*)::int AS c FROM user_subscriptions
       WHERE plan_id = 'talent_pro_799' AND status = 'active'`,
    ),
    pool.query(
      `SELECT COUNT(*)::int AS c FROM user_subscriptions
       WHERE plan_id = 'merchant_marketing_799' AND status = 'active'`,
    ),
    pool.query(
      `SELECT COUNT(*)::int AS c FROM growth_entitlements
       WHERE aqond_pass_started_at IS NOT NULL
         AND (pass_expires_at IS NULL OR pass_expires_at > NOW())`,
    ),
    pool.query(
      `SELECT COUNT(*)::int AS c FROM growth_entitlements WHERE mystery_voucher_unlocked = TRUE`,
    ),
    pool.query(
      `SELECT COUNT(*)::int AS c FROM growth_entitlements WHERE mystery_voucher_claimed_at IS NOT NULL`,
    ),
    pool.query(
      `SELECT plan_id, COUNT(*)::int AS orders, COALESCE(SUM(amount_baht), 0)::float AS revenue
       FROM growth_subscription_orders WHERE status = 'active' AND paid_at >= $1
       GROUP BY plan_id`,
      [since.toISOString()],
    ),
    pool.query(
      `SELECT plan_id, COUNT(*)::int AS c FROM growth_subscription_orders
       WHERE created_at >= $1 GROUP BY plan_id`,
      [since.toISOString()],
    ),
  ]);

  const revenueByPlan = {};
  let revenueTotal = 0;
  for (const row of revenue.rows) {
    revenueByPlan[row.plan_id] = {
      orders: row.orders,
      revenueThb: row.revenue,
    };
    revenueTotal += row.revenue;
  }

  const checkoutAttempts = {};
  for (const row of recentOrders.rows) {
    checkoutAttempts[row.plan_id] = row.c;
  }

  const talentRegistered = entitlements.rows[0]?.c || 0;
  const talentMilestone10 = talentMilestone.rows[0]?.c || 0;
  const talentVideoUsers = aiVideoUsers.rows[0]?.c || 0;
  const talentProActive = talentSubs.rows[0]?.c || 0;

  const consumerMysteryUnlocked = mysteryUnlocked.rows[0]?.c || 0;
  const consumerMysteryClaimed = mysteryClaimed.rows[0]?.c || 0;
  const consumerPassActive = passActive.rows[0]?.c || 0;
  const consumerMysteryMilestone = mysteryMilestone.rows[0]?.c || 0;

  const merchantProActive = merchantSubs.rows[0]?.c || 0;

  function pct(num, den) {
    if (!den) return 0;
    return Math.round((num / den) * 1000) / 10;
  }

  return {
    rangeDays: days,
    generatedAt: new Date().toISOString(),
    talent: {
      registered: talentRegistered,
      milestone10Unlocked: talentMilestone10,
      aiVideoUsers: talentVideoUsers,
      videoJobsInRange: videoJobs.rows[0]?.c || 0,
      subscribed799: talentProActive,
      conversionToMilestonePct: pct(talentMilestone10, talentRegistered),
      conversionToVideoPct: pct(talentVideoUsers, talentMilestone10 || talentRegistered),
      conversionTo799Pct: pct(talentProActive, talentVideoUsers || talentMilestone10),
      checkoutAttempts: checkoutAttempts.talent_pro_799 || 0,
    },
    consumer: {
      mysteryMilestone10: consumerMysteryMilestone,
      mysteryUnlocked: consumerMysteryUnlocked,
      mysteryClaimed: consumerMysteryClaimed,
      aqondPassActive: consumerPassActive,
      conversionClaimPct: pct(consumerMysteryClaimed, consumerMysteryUnlocked),
      conversionPassPct: pct(consumerPassActive, consumerMysteryClaimed || consumerMysteryUnlocked),
    },
    merchant: {
      subscribed799: merchantProActive,
      checkoutAttempts: checkoutAttempts.merchant_marketing_799 || 0,
      conversionFromPassPct: pct(merchantProActive, consumerPassActive),
    },
    revenue799: {
      byPlan: revenueByPlan,
      totalThb: Math.round(revenueTotal * 100) / 100,
      talentActive: talentProActive,
      merchantActive: merchantProActive,
    },
  };
}
