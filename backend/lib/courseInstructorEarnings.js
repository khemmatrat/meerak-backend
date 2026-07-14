/**

 * Instructor course earnings snapshot — orders + wallet balances (Phase 8).

 */



function num(row, key, fallback = 0) {

  return Number(row?.[key] ?? fallback);

}



export async function loadInstructorWalletSnapshot(pool, userId) {

  const r = await pool.query(

    `SELECT

       COALESCE(wallet_pending, 0)::numeric AS wallet_pending,

       COALESCE(wallet_balance, 0)::numeric AS wallet_balance,

       COALESCE(wallet_balance_withdrawable, 0)::numeric AS wallet_balance_withdrawable

     FROM users WHERE id = $1::uuid LIMIT 1`,

    [userId],

  );

  const row = r.rows?.[0] || {};

  return {

    pending: num(row, 'wallet_pending'),

    balance: num(row, 'wallet_balance'),

    withdrawable: num(row, 'wallet_balance_withdrawable'),

  };

}



export async function loadInstructorOrderSummary(pool, userId) {

  const r = await pool.query(

    `SELECT

       COUNT(*)::int AS orders,

       COALESCE(SUM(gross_amount), 0)::numeric AS gross,

       COALESCE(SUM(platform_fee), 0)::numeric AS platform_fee,

       COALESCE(SUM(instructor_net), 0)::numeric AS instructor_net,

       COALESCE(SUM(CASE WHEN created_at >= date_trunc('day', NOW()) THEN gross_amount ELSE 0 END), 0)::numeric AS gross_today,

       COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', NOW()) THEN gross_amount ELSE 0 END), 0)::numeric AS gross_month,

       COALESCE(SUM(CASE WHEN created_at >= date_trunc('day', NOW()) THEN instructor_net ELSE 0 END), 0)::numeric AS instructor_net_today,

       COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', NOW()) THEN instructor_net ELSE 0 END), 0)::numeric AS instructor_net_month,

       COUNT(*) FILTER (WHERE payout_status = 'held' AND refund_status = 'none')::int AS payouts_pending,

       COUNT(*) FILTER (WHERE payout_status = 'released')::int AS payouts_released,

       COUNT(*) FILTER (WHERE payout_status = 'blocked')::int AS payouts_blocked,

       COALESCE(SUM(instructor_net) FILTER (WHERE payout_status = 'held' AND refund_status = 'none'), 0)::numeric AS pending_net,

       COALESCE(SUM(instructor_net) FILTER (WHERE payout_status = 'released'), 0)::numeric AS released_net

     FROM course_purchase_orders

     WHERE instructor_user_id = $1::uuid AND status = 'completed'`,

    [userId],

  );

  const row = r.rows?.[0] || {};

  return {

    orders: num(row, 'orders'),

    gross: num(row, 'gross'),

    platform_fee: num(row, 'platform_fee'),

    instructor_net: num(row, 'instructor_net'),

    gross_today: num(row, 'gross_today'),

    gross_month: num(row, 'gross_month'),

    instructor_net_today: num(row, 'instructor_net_today'),

    instructor_net_month: num(row, 'instructor_net_month'),

    payouts_pending: num(row, 'payouts_pending'),

    payouts_released: num(row, 'payouts_released'),

    payouts_blocked: num(row, 'payouts_blocked'),

    pending_net: num(row, 'pending_net'),

    released_net: num(row, 'released_net'),

  };

}



export async function loadInstructorRecentOrderRows(pool, userId, limit = 30) {

  const r = await pool.query(

    `SELECT

       o.*,

       c.title AS course_title,

       c.subtitle,

       c.image_url,

       buyer.full_name AS buyer_name,

       instructor.full_name AS instructor_name,

       l.bill_no,

       l.transaction_no,

       l.gateway

     FROM course_purchase_orders o

     JOIN courses c ON c.id = o.course_id

     LEFT JOIN users buyer ON buyer.id = o.user_id

     LEFT JOIN users instructor ON instructor.id = o.instructor_user_id

     LEFT JOIN payment_ledger_audit l ON l.id = o.ledger_id

     WHERE o.instructor_user_id = $1::uuid

     ORDER BY o.created_at DESC

     LIMIT $2`,

    [userId, Math.min(Math.max(limit, 1), 50)],

  );

  return r.rows || [];

}



export async function loadInstructorTopCourses(pool, userId, limit = 10) {

  const r = await pool.query(

    `SELECT

       o.course_id,

       c.title,

       COUNT(*)::int AS orders,

       COALESCE(SUM(o.gross_amount), 0)::numeric AS gross,

       COALESCE(SUM(o.platform_fee), 0)::numeric AS platform_fee,

       COALESCE(SUM(o.instructor_net), 0)::numeric AS instructor_net

     FROM course_purchase_orders o

     JOIN courses c ON c.id = o.course_id

     WHERE o.instructor_user_id = $1::uuid AND o.status = 'completed'

     GROUP BY o.course_id, c.title

     ORDER BY instructor_net DESC, orders DESC

     LIMIT $2`,

    [userId, Math.min(Math.max(limit, 1), 20)],

  );

  return r.rows || [];

}



export async function loadInstructorPayoutForecast(pool, userId) {

  const r = await pool.query(

    `SELECT

       MIN(COALESCE(o.payout_release_at, o.created_at)) FILTER (

         WHERE o.payout_status = 'held' AND o.refund_status = 'none'

       ) AS next_release_at,

       MIN(COALESCE(o.payout_release_at, o.created_at)) FILTER (

         WHERE o.payout_status = 'held' AND o.refund_status = 'none'

           AND COALESCE(o.payout_release_at, o.created_at) > NOW()

       ) AS next_future_release_at,

       COALESCE(SUM(o.instructor_net) FILTER (

         WHERE o.payout_status = 'held' AND o.refund_status = 'none'

           AND COALESCE(o.payout_release_at, o.created_at) <= NOW()

       ), 0)::numeric AS releasable_now_net,

       COALESCE(SUM(o.instructor_net) FILTER (

         WHERE o.payout_status = 'held' AND o.refund_status = 'none'

           AND COALESCE(o.payout_release_at, o.created_at) > NOW()

       ), 0)::numeric AS held_until_future_net,

       COUNT(*) FILTER (

         WHERE o.payout_status = 'held' AND o.refund_status = 'none'

       )::int AS held_orders

     FROM course_purchase_orders o

     WHERE o.instructor_user_id = $1::uuid AND o.status = 'completed'`,

    [userId],

  );

  const row = r.rows?.[0] || {};

  return {

    nextReleaseAt: row.next_release_at || null,

    nextFutureReleaseAt: row.next_future_release_at || null,

    releasableNowNet: num(row, 'releasable_now_net'),

    heldUntilFutureNet: num(row, 'held_until_future_net'),

    heldOrders: num(row, 'held_orders'),

  };

}



export async function loadInstructorCourseEarnings(pool, userId, { recentLimit = 30 } = {}) {

  const [wallet, summary, recentRows] = await Promise.all([

    loadInstructorWalletSnapshot(pool, userId),

    loadInstructorOrderSummary(pool, userId),

    loadInstructorRecentOrderRows(pool, userId, recentLimit),

  ]);

  return { wallet, summary, recentRows };

}



/** Unified instructor dashboard payload (sales + earnings consolidated). */

export async function loadInstructorDashboard(pool, userId, { recentLimit = 50 } = {}) {

  const [wallet, summary, recentRows, topCourses, forecast] = await Promise.all([

    loadInstructorWalletSnapshot(pool, userId),

    loadInstructorOrderSummary(pool, userId),

    loadInstructorRecentOrderRows(pool, userId, recentLimit),

    loadInstructorTopCourses(pool, userId, 10),

    loadInstructorPayoutForecast(pool, userId),

  ]);

  return { wallet, summary, recentRows, topCourses, forecast };

}



export function mapInstructorDashboardResponse(data, mapReceipt) {

  return {

    summary: data.summary,

    wallet: data.wallet,

    forecast: data.forecast,

    topCourses: data.topCourses,

    recent: (data.recentRows || []).map(mapReceipt),

  };

}

