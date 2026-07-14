/**
 * Buyer course purchase order history.
 */

function num(row, key, fallback = 0) {
  return Number(row?.[key] ?? fallback);
}

export async function loadBuyerCourseOrderRows(pool, userId, { limit = 30, offset = 0 } = {}) {
  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const safeOffset = Math.max(offset, 0);
  const r = await pool.query(
    `SELECT
       o.*,
       c.title AS course_title,
       c.subtitle,
       c.image_url,
       c.status AS course_status,
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
     WHERE (
       o.user_id = $1::uuid
       OR COALESCE(o.metadata->>'purchased_by_user_id', '') = $1::text
     )
     ORDER BY o.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, safeLimit, safeOffset],
  );
  return r.rows || [];
}

export async function countBuyerCourseOrders(pool, userId) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM course_purchase_orders o
     WHERE (
       o.user_id = $1::uuid
       OR COALESCE(o.metadata->>'purchased_by_user_id', '') = $1::text
     )`,
    [userId],
  );
  return num(r.rows?.[0], 'total', 0);
}

export async function loadBuyerCourseOrders(pool, userId, opts = {}) {
  const [rows, total] = await Promise.all([
    loadBuyerCourseOrderRows(pool, userId, opts),
    countBuyerCourseOrders(pool, userId),
  ]);
  return { rows, total, limit: Math.min(Math.max(opts.limit || 30, 1), 50), offset: Math.max(opts.offset || 0, 0) };
}
