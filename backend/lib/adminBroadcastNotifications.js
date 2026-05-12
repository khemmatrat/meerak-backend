/**
 * ประวัติ broadcast จากแอดมิน — เก็บใน DB แทน broadcastNotificationsStore
 */

function rowToAdminItem(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    title: row.title || '',
    message: row.message || '',
    target: row.target || 'All',
    sentAt: row.sent_at ? new Date(row.sent_at).toISOString() : new Date().toISOString(),
  };
}

function rowToLatestItem(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    targetUserId: '',
    title: row.title || '',
    message: row.message || '',
    sentAt: row.sent_at ? new Date(row.sent_at).toISOString() : new Date().toISOString(),
  };
}

/**
 * @param {import('pg').Pool} pool
 */
export async function insertAdminBroadcast(pool, { id, title, message, target, fcmSuccess, fcmFailed }) {
  await pool.query(
    `INSERT INTO admin_broadcast_notifications (id, title, message, target, fcm_success, fcm_failed)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, title, message, target || 'All', fcmSuccess ?? 0, fcmFailed ?? 0]
  );
}

/**
 * @param {import('pg').Pool} pool
 */
export async function listAdminBroadcasts(pool, limit) {
  const r = await pool.query(
    `SELECT id, title, message, target, sent_at, fcm_success, fcm_failed
     FROM admin_broadcast_notifications
     ORDER BY sent_at DESC
     LIMIT $1`,
    [limit]
  );
  return (r.rows || []).map(rowToAdminItem).filter(Boolean);
}

/**
 * ผสมใน GET /api/notifications/latest — ผู้ใช้ล็อกอินในแอปมือถือ: All + Mobile
 * @param {import('pg').Pool} pool
 */
export async function listBroadcastsForMobileUserMerge(pool, limit) {
  const r = await pool.query(
    `SELECT id, title, message, target, sent_at
     FROM admin_broadcast_notifications
     WHERE target IN ('All', 'Mobile')
     ORDER BY sent_at DESC
     LIMIT $1`,
    [limit]
  );
  return (r.rows || []).map(rowToLatestItem).filter(Boolean);
}

/**
 * ไม่ส่ง userId (เช่น landing): All + Landing
 * @param {import('pg').Pool} pool
 */
export async function listBroadcastsForAnonymousMerge(pool, limit) {
  const r = await pool.query(
    `SELECT id, title, message, target, sent_at
     FROM admin_broadcast_notifications
     WHERE target IN ('All', 'Landing')
     ORDER BY sent_at DESC
     LIMIT $1`,
    [limit]
  );
  return (r.rows || []).map(rowToLatestItem).filter(Boolean);
}
