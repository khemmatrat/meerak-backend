/**
 * Course marketplace admin audit — course_marketplace_audit_log + system_event_log.
 */
export async function logCourseMarketplaceEvent(pool, {
  adminUserId,
  action,
  entityType,
  entityId,
  courseId = null,
  beforeStatus = null,
  afterStatus = null,
  reason = null,
  metadata = {},
  stateBefore = null,
  stateAfter = null,
}) {
  if (!pool) return;
  const meta = { ...(metadata || {}), course_id: courseId || metadata?.course_id || null };

  try {
    if (courseId) {
      await pool.query(
        `INSERT INTO course_marketplace_audit_log
           (course_id, admin_user_id, action, before_status, after_status, reason, metadata)
         VALUES ($1, $2::uuid, $3, $4, $5, $6, $7::jsonb)`,
        [
          courseId,
          adminUserId || null,
          action,
          beforeStatus,
          afterStatus,
          reason || null,
          JSON.stringify(meta),
        ],
      );
    }
  } catch (e) {
    console.warn('[courseMarketplaceAudit] audit log skipped:', e?.message);
  }

  try {
    await pool.query(
      `INSERT INTO system_event_log (actor_type, actor_id, action, entity_type, entity_id, state_before, state_after, reason)
       VALUES ('admin', $1, $2, $3, $4, $5, $6, $7)`,
      [
        adminUserId || null,
        action,
        entityType || 'course_marketplace',
        entityId || courseId || null,
        stateBefore ? JSON.stringify(stateBefore) : null,
        stateAfter ? JSON.stringify(stateAfter) : null,
        reason || null,
      ],
    );
  } catch (e) {
    console.warn('[courseMarketplaceAudit] system_event_log skipped:', e?.message);
  }
}

export async function listCourseMarketplaceAuditLog(pool, { courseId = null, limit = 50 } = {}) {
  const cap = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const params = [];
  let where = '';
  if (courseId) {
    params.push(String(courseId));
    where = 'WHERE course_id = $1';
  }
  params.push(cap);
  const r = await pool.query(
    `SELECT a.*, u.full_name AS admin_name, u.email AS admin_email
     FROM course_marketplace_audit_log a
     LEFT JOIN users u ON u.id = a.admin_user_id
     ${where}
     ORDER BY a.created_at DESC
     LIMIT $${params.length}`,
    params,
  );
  return (r.rows || []).map((row) => ({
    id: row.id,
    courseId: row.course_id,
    adminUserId: row.admin_user_id,
    adminName: row.admin_name || null,
    action: row.action,
    beforeStatus: row.before_status,
    afterStatus: row.after_status,
    reason: row.reason,
    metadata: row.metadata || {},
    createdAt: row.created_at,
  }));
}
