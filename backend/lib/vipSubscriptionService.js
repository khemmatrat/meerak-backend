/**
 * VIP subscription orders — Silver / Gold / Platinum
 * บันทึกการซื้อ, auto-activate เมื่อชำระสำเร็จ, แจ้งเตือนต่ออายุเมื่อหมด
 */

export const VIP_TIER_CONFIG = {
  silver: { quotaPerMonth: 12, discountPercent: 5, priceMonthly: 399 },
  gold: { quotaPerMonth: 30, discountPercent: 5, priceMonthly: 999 },
  platinum: { quotaPerMonth: -1, discountPercent: 5, priceMonthly: 1999 },
};

const VALID_TIERS = ['silver', 'gold', 'platinum'];

function tierConfig(tier) {
  return VIP_TIER_CONFIG[String(tier || '').toLowerCase()] || null;
}

function billingMonthFromDate(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export async function ensureVipSubscriptionSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vip_subscription_orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tier VARCHAR(20) NOT NULL CHECK (tier IN ('silver', 'gold', 'platinum')),
      status VARCHAR(30) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'active', 'expired', 'cancelled', 'failed')),
      amount_baht NUMERIC(12, 2) NOT NULL DEFAULT 0,
      billing_month VARCHAR(7),
      started_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      paid_at TIMESTAMPTZ,
      activated_at TIMESTAMPTZ,
      payment_method VARCHAR(40),
      payment_ref VARCHAR(200),
      renewal_notified_at TIMESTAMPTZ,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => { });
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_vip_sub_orders_user ON vip_subscription_orders(user_id, created_at DESC)`).catch(() => { });
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS vip_started_at TIMESTAMPTZ`).catch(() => { });
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS vip_tier VARCHAR(20) DEFAULT 'none'`).catch(() => { });
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS vip_expiry TIMESTAMPTZ`).catch(() => { });
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS vip_quota_balance INTEGER DEFAULT 0`).catch(() => { });
}

export async function createVipSubscriptionOrder(pool, userId, tier, opts = {}) {
  const t = String(tier || '').toLowerCase();
  if (!VALID_TIERS.includes(t)) {
    throw Object.assign(new Error('tier ต้องเป็น silver, gold หรือ platinum'), { code: 'VALIDATION' });
  }
  const cfg = tierConfig(t);
  const uid = String(userId);
  const status = opts.status || 'processing';
  const now = new Date();
  const billingMonth = billingMonthFromDate(now);

  const r = await pool.query(
    `INSERT INTO vip_subscription_orders
       (user_id, tier, status, amount_baht, billing_month, payment_method, metadata, created_at, updated_at)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::jsonb, NOW(), NOW())
     RETURNING *`,
    [
      uid,
      t,
      status,
      cfg.priceMonthly,
      billingMonth,
      opts.payment_method || null,
      JSON.stringify(opts.metadata || {}),
    ],
  );
  const order = r.rows[0];

  if (status === 'pending') {
    try {
      const { notifyAdminVipPurchase } = await import('./adminLiveEvents.js');
      await notifyAdminVipPurchase(pool, {
        userId: uid,
        tier: t,
        status: 'pending',
        orderId: order.id,
        amount: cfg.priceMonthly,
      });
    } catch (e) {
      console.warn('[vip] admin live event pending:', e?.message);
    }
  }

  return order;
}

export async function activateVipSubscriptionOrder(pool, orderId, opts = {}) {
  const ord = await pool.query(`SELECT * FROM vip_subscription_orders WHERE id = $1::uuid LIMIT 1`, [orderId]);
  const order = ord.rows[0];
  if (!order) throw Object.assign(new Error('ไม่พบรายการ VIP'), { code: 'NOT_FOUND' });
  if (order.status === 'active') return { order, alreadyActive: true };

  const cfg = tierConfig(order.tier);
  const startedAt = new Date();
  const expiresAt = addDays(startedAt, opts.durationDays || 30);
  const quotaBalance = cfg.quotaPerMonth === -1 ? 999 : cfg.quotaPerMonth;

  const upd = await pool.query(
    `UPDATE vip_subscription_orders SET
       status = 'active',
       started_at = $2,
       expires_at = $3,
       paid_at = COALESCE(paid_at, $2),
       activated_at = $2,
       payment_ref = COALESCE($4, payment_ref),
       payment_method = COALESCE($5, payment_method),
       updated_at = NOW()
     WHERE id = $1::uuid
     RETURNING *`,
    [order.id, startedAt, expiresAt, opts.payment_ref || null, opts.payment_method || null],
  );

  await pool.query(
    `UPDATE users SET
       vip_tier = $2,
       vip_expiry = $3,
       vip_quota_balance = $4,
       vip_started_at = $5,
       is_vip = TRUE,
       updated_at = NOW()
     WHERE id = $1::uuid`,
    [order.user_id, order.tier, expiresAt, quotaBalance, startedAt],
  );

  try {
    const { notifyAdminVipPurchase } = await import('./adminLiveEvents.js');
    await notifyAdminVipPurchase(pool, {
      userId: order.user_id,
      tier: order.tier,
      status: 'active',
      orderId: order.id,
      amount: order.amount_baht,
      startedAt,
      expiresAt,
    });
  } catch (e) {
    console.warn('[vip] admin live event active:', e?.message);
  }

  return { order: upd.rows[0], alreadyActive: false, expiresAt, startedAt, quotaBalance };
}

export async function markVipOrderFailed(pool, orderId, reason) {
  await pool.query(
    `UPDATE vip_subscription_orders SET status = 'failed', metadata = metadata || $2::jsonb, updated_at = NOW()
     WHERE id = $1::uuid AND status IN ('pending', 'processing')`,
    [orderId, JSON.stringify({ fail_reason: reason })],
  );
}

export async function getUserVipStatus(pool, userId) {
  const uid = String(userId);
  const [userRes, pendingRes, activeRes] = await Promise.all([
    pool.query(
      `SELECT vip_tier, vip_expiry, vip_started_at, vip_quota_balance, is_vip
       FROM users WHERE id = $1::uuid LIMIT 1`,
      [uid],
    ),
    pool.query(
      `SELECT * FROM vip_subscription_orders
       WHERE user_id = $1::uuid AND status IN ('pending', 'processing')
       ORDER BY created_at DESC LIMIT 1`,
      [uid],
    ),
    pool.query(
      `SELECT * FROM vip_subscription_orders
       WHERE user_id = $1::uuid AND status = 'active'
       ORDER BY activated_at DESC NULLS LAST LIMIT 1`,
      [uid],
    ),
  ]);
  const u = userRes.rows[0] || {};
  const expiry = u.vip_expiry ? new Date(u.vip_expiry) : null;
  const isActive =
    VALID_TIERS.includes(String(u.vip_tier || '').toLowerCase()) &&
    expiry &&
    expiry.getTime() > Date.now();

  return {
    tier: (u.vip_tier || 'none').toLowerCase(),
    is_vip: !!u.is_vip && isActive,
    vip_started_at: u.vip_started_at || activeRes.rows[0]?.started_at || null,
    vip_expiry: u.vip_expiry || null,
    vip_quota_balance: u.vip_quota_balance ?? null,
    pending_order: pendingRes.rows[0] || null,
    active_order: activeRes.rows[0] || null,
    display_status: pendingRes.rows[0]
      ? pendingRes.rows[0].status === 'pending'
        ? 'pending_payment'
        : 'processing'
      : isActive
        ? 'active'
        : expiry && expiry.getTime() <= Date.now()
          ? 'expired'
          : 'none',
  };
}

export async function getAdminVipMembership(pool, userId) {
  const uid = String(userId);
  const status = await getUserVipStatus(pool, uid);
  const hist = await pool.query(
    `SELECT id, tier, status, amount_baht, billing_month,
            started_at, expires_at, paid_at, activated_at, payment_method, payment_ref, created_at
     FROM vip_subscription_orders
     WHERE user_id = $1::uuid
     ORDER BY created_at DESC
     LIMIT 48`,
    [uid],
  );

  return {
    current: {
      tier: status.tier,
      is_vip: status.is_vip,
      display_status: status.display_status,
      vip_started_at: status.vip_started_at,
      vip_expiry: status.vip_expiry,
      vip_quota_balance: status.vip_quota_balance,
      pending_order: status.pending_order,
      active_order: status.active_order,
    },
    history: (hist.rows || []).map((r) => ({
      id: r.id,
      tier: r.tier,
      status: r.status,
      amount_baht: r.amount_baht != null ? Number(r.amount_baht) : null,
      billing_month: r.billing_month,
      started_at: r.started_at,
      expires_at: r.expires_at,
      paid_at: r.paid_at,
      activated_at: r.activated_at,
      payment_method: r.payment_method,
      payment_ref: r.payment_ref,
      created_at: r.created_at,
    })),
  };
}

export function buildVipRenewalPromoMessage(expiredTier) {
  const tierLabel = expiredTier && expiredTier !== 'none' ? String(expiredTier).toUpperCase() : 'VIP';
  return {
    title: 'VIP หมดอายุแล้ว — โปรต่ออายุพิเศษ',
    message:
      `สิทธิ์ ${tierLabel} ของคุณสิ้นสุดแล้ว สมัครต่ออายุวันนี้: Silver 399฿ · Gold 999฿ · Platinum 1,999฿ — รับส่วนลด on-top 5% และสิทธิพิเศษทันที กดที่เมนู VIP ในแอป`,
  };
}

/** หมดอายุ VIP + แจ้งเตือนเชิญต่ออายุ (ครั้งเดียวต่อรอบหมดอายุ) */
export async function processVipExpirations(pool, notifyFn) {
  const expiredUsers = await pool.query(
    `SELECT id, vip_tier, vip_expiry FROM users
     WHERE vip_tier IS NOT NULL AND LOWER(vip_tier) IN ('silver','gold','platinum')
       AND vip_expiry IS NOT NULL AND vip_expiry <= NOW()`,
  );

  let processed = 0;
  for (const row of expiredUsers.rows || []) {
    const uid = row.id;
    const tier = String(row.vip_tier).toLowerCase();

    await pool.query(
      `UPDATE vip_subscription_orders SET status = 'expired', updated_at = NOW()
       WHERE user_id = $1::uuid AND status = 'active'`,
      [uid],
    );

    await pool.query(
      `UPDATE users SET vip_tier = 'none', is_vip = FALSE, vip_quota_balance = 0, updated_at = NOW()
       WHERE id = $1::uuid`,
      [uid],
    );

    const lastOrder = await pool.query(
      `SELECT id, renewal_notified_at FROM vip_subscription_orders
       WHERE user_id = $1::uuid ORDER BY expires_at DESC NULLS LAST LIMIT 1`,
      [uid],
    );
    const orderRow = lastOrder.rows[0];
    if (orderRow && !orderRow.renewal_notified_at && typeof notifyFn === 'function') {
      const promo = buildVipRenewalPromoMessage(tier);
      try {
        await notifyFn(uid, promo.title, promo.message);
        await pool.query(
          `UPDATE vip_subscription_orders SET renewal_notified_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [orderRow.id],
        );
      } catch (e) {
        console.warn('[vip expiry notify]', e?.message);
      }
    }
    processed += 1;
  }
  return { processed };
}
