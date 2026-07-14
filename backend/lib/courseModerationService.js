/**
 * Phase 10 — admin moderation for course reviews and Q&A.
 */
import { refreshCourseRatingStats } from './courseReviewService.js';
import { logCourseMarketplaceEvent } from './courseMarketplaceAudit.js';

export async function moderateCourseReview(pool, {
  reviewId,
  courseId,
  adminUserId,
  action,
  reason = null,
}) {
  const allowed = ['hide', 'unhide', 'delete'];
  if (!allowed.includes(action)) {
    return { ok: false, httpStatus: 400, error: 'Invalid action', code: 'invalid_action' };
  }

  const cur = await pool.query(
    `SELECT cr.*, c.title AS course_title
     FROM course_reviews cr
     JOIN courses c ON c.id = cr.course_id
     WHERE cr.id = $1::uuid AND cr.course_id = $2
     LIMIT 1`,
    [reviewId, courseId],
  );
  const row = cur.rows?.[0];
  if (!row) return { ok: false, httpStatus: 404, error: 'Review not found', code: 'not_found' };

  const before = { is_hidden: row.is_hidden, rating: row.rating };

  if (action === 'delete') {
    await pool.query(`DELETE FROM course_reviews WHERE id = $1::uuid`, [reviewId]);
    await refreshCourseRatingStats(pool, courseId);
    await logCourseMarketplaceEvent(pool, {
      adminUserId,
      action: 'course_review_deleted',
      entityType: 'course_reviews',
      entityId: reviewId,
      courseId,
      reason,
      stateBefore: before,
      stateAfter: { deleted: true },
    });
    const stats = await pool.query(
      `SELECT rating_avg, rating_count FROM courses WHERE id = $1`,
      [courseId],
    );
    return {
      ok: true,
      action,
      ratingAvg: Number(stats.rows?.[0]?.rating_avg || 0),
      ratingCount: Number(stats.rows?.[0]?.rating_count || 0),
    };
  }

  const isHidden = action === 'hide';
  await pool.query(
    `UPDATE course_reviews
     SET is_hidden = $3,
         moderation_reason = $4,
         moderated_by = $5::uuid,
         moderated_at = NOW(),
         updated_at = NOW()
     WHERE id = $1::uuid AND course_id = $2`,
    [reviewId, courseId, isHidden, reason || null, adminUserId],
  );
  await refreshCourseRatingStats(pool, courseId);
  await logCourseMarketplaceEvent(pool, {
    adminUserId,
    action: isHidden ? 'course_review_hidden' : 'course_review_unhidden',
    entityType: 'course_reviews',
    entityId: reviewId,
    courseId,
    reason,
    stateBefore: before,
    stateAfter: { is_hidden: isHidden },
  });
  const stats = await pool.query(
    `SELECT rating_avg, rating_count FROM courses WHERE id = $1`,
    [courseId],
  );
  return {
    ok: true,
    action,
    ratingAvg: Number(stats.rows?.[0]?.rating_avg || 0),
    ratingCount: Number(stats.rows?.[0]?.rating_count || 0),
  };
}

export async function moderateCourseQaMessage(pool, {
  messageId,
  courseId,
  adminUserId,
  action,
  reason = null,
}) {
  const allowed = ['hide', 'unhide', 'close', 'reopen', 'delete'];
  if (!allowed.includes(action)) {
    return { ok: false, httpStatus: 400, error: 'Invalid action', code: 'invalid_action' };
  }

  const cur = await pool.query(
    `SELECT * FROM course_questions_qa WHERE id = $1::uuid AND course_id = $2 LIMIT 1`,
    [messageId, courseId],
  );
  const row = cur.rows?.[0];
  if (!row) return { ok: false, httpStatus: 404, error: 'Message not found', code: 'not_found' };

  const before = { is_hidden: row.is_hidden, is_closed: row.is_closed };

  if (action === 'delete') {
    await pool.query(`DELETE FROM course_questions_qa WHERE id = $1::uuid OR parent_id = $1::uuid`, [messageId]);
    await logCourseMarketplaceEvent(pool, {
      adminUserId,
      action: 'course_qa_deleted',
      entityType: 'course_questions_qa',
      entityId: messageId,
      courseId,
      reason,
      stateBefore: before,
      stateAfter: { deleted: true },
    });
    return { ok: true, action };
  }

  let isHidden = row.is_hidden;
  let isClosed = row.is_closed;
  if (action === 'hide') isHidden = true;
  if (action === 'unhide') isHidden = false;
  if (action === 'close') isClosed = true;
  if (action === 'reopen') isClosed = false;

  await pool.query(
    `UPDATE course_questions_qa
     SET is_hidden = $3,
         is_closed = $4,
         moderation_reason = $5,
         moderated_by = $6::uuid,
         moderated_at = NOW(),
         updated_at = NOW()
     WHERE id = $1::uuid AND course_id = $2`,
    [messageId, courseId, isHidden, isClosed, reason || null, adminUserId],
  );

  await logCourseMarketplaceEvent(pool, {
    adminUserId,
    action: `course_qa_${action}`,
    entityType: 'course_questions_qa',
    entityId: messageId,
    courseId,
    reason,
    stateBefore: before,
    stateAfter: { is_hidden: isHidden, is_closed: isClosed },
  });

  return { ok: true, action, isHidden, isClosed };
}

export async function listAdminCourseReviews(pool, courseId, { includeHidden = true, limit = 50 } = {}) {
  const cap = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const hiddenFilter = includeHidden ? '' : ' AND cr.is_hidden IS NOT TRUE';
  const r = await pool.query(
    `SELECT cr.*, u.full_name, u.email
     FROM course_reviews cr
     JOIN users u ON u.id = cr.user_id
     WHERE cr.course_id = $1${hiddenFilter}
     ORDER BY cr.created_at DESC
     LIMIT $2`,
    [courseId, cap],
  );
  return (r.rows || []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    userName: row.full_name || 'ผู้เรียน',
    userEmail: row.email || null,
    rating: row.rating,
    comment: row.comment || '',
    isHidden: row.is_hidden === true,
    moderationReason: row.moderation_reason || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function listAdminCourseQa(pool, courseId, { limit = 50 } = {}) {
  const cap = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const r = await pool.query(
    `SELECT q.*, u.full_name AS user_name, u.email AS user_email
     FROM course_questions_qa q
     JOIN users u ON u.id = q.user_id
     WHERE q.course_id = $1 AND q.parent_id IS NULL
     ORDER BY q.created_at DESC
     LIMIT $2`,
    [courseId, cap],
  );
  return (r.rows || []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    userName: row.user_name || 'ผู้เรียน',
    userEmail: row.user_email || null,
    lessonId: row.lesson_id,
    body: row.body,
    isHidden: row.is_hidden === true,
    isClosed: row.is_closed === true,
    moderationReason: row.moderation_reason || null,
    createdAt: row.created_at,
  }));
}
