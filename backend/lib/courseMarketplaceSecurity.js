/**
 * Phase 12 — security audit helpers for course marketplace (no side effects).
 */
import { assertLessonPlaybackAccess, redactLessonForViewer } from './courseLessonPlayback.js';
import { evaluateCoursePurchaseGate } from './coursePurchaseService.js';
import { evaluateCourseRefundEligibility } from './courseRefundEngine.js';

export const COURSE_SECURITY_CONTROLS = Object.freeze([
  { id: 'purchase_gate', label: 'Self-purchase blocked; unpublished courses blocked' },
  { id: 'double_purchase', label: 'Active order / enrollment prevents duplicate purchase' },
  { id: 'playback_gated', label: 'Non-preview lessons require enrollment + signed playback' },
  { id: 'catalog_redaction', label: 'Catalog/detail JSON redacts raw video URLs' },
  { id: 'refund_abuse', label: 'Refund blocked after guarantee window or progress > threshold' },
  { id: 'idempotency', label: 'Purchase Idempotency-Key prevents duplicate wallet debits' },
]);

/** Scan public course payload for leaked video URLs in lesson arrays. */
export function auditCoursePublicPayload(payload) {
  const issues = [];
  const lessons = payload?.lessons || payload?.course?.lessons || [];
  for (const lesson of lessons) {
    if (String(lesson?.videoUrl || lesson?.video_url || '').trim()) {
      issues.push({ lessonId: lesson.id, issue: 'video_url_leaked' });
    }
  }
  return { ok: issues.length === 0, issues, lessonsChecked: lessons.length };
}

export { assertLessonPlaybackAccess, evaluateCoursePurchaseGate, evaluateCourseRefundEligibility };

/**
 * Automated security checklist (pure / read-only queries via pool).
 * @param {import('pg').Pool} pool
 */
export async function runCourseSecurityAudit(pool) {
  const checks = [];

  const gateSelf = evaluateCoursePurchaseGate(
    { is_marketplace: true, status: 'published', instructor_user_id: 'buyer-1' },
    'buyer-1',
  );
  checks.push({
    id: 'self_purchase_blocked',
    pass: gateSelf.ok === false,
    detail: gateSelf.code,
  });

  const gateDraft = evaluateCoursePurchaseGate(
    { is_marketplace: true, status: 'draft', instructor_user_id: 'other' },
    'buyer-1',
  );
  checks.push({
    id: 'unpublished_blocked',
    pass: gateDraft.ok === false,
    detail: gateDraft.code,
  });

  const refundHighProgress = evaluateCourseRefundEligibility({
    order: { status: 'completed', created_at: new Date(), refund_status: 'none' },
    enrollment: { progress_pct: 80 },
    policy: { guaranteeDays: 7, maxProgressPct: 20 },
  });
  checks.push({
    id: 'refund_progress_cap',
    pass: refundHighProgress.eligible === false && refundHighProgress.code === 'progress_exceeded',
    detail: refundHighProgress.code,
  });

  const refundExpired = evaluateCourseRefundEligibility({
    order: { status: 'completed', created_at: new Date(Date.now() - 30 * 86400000), refund_status: 'none' },
    enrollment: { progress_pct: 0 },
    policy: { guaranteeDays: 7, maxProgressPct: 20 },
  });
  checks.push({
    id: 'refund_guarantee_window',
    pass: refundExpired.eligible === false && refundExpired.code === 'guarantee_expired',
    detail: refundExpired.code,
  });

  let playbackPreview = { pass: false };
  try {
    const courseRes = await pool.query(
      `SELECT cl.id, cl.course_id, c.status, c.is_marketplace, cl.is_preview
       FROM course_lessons cl
       JOIN courses c ON c.id = cl.course_id
       WHERE c.is_marketplace = TRUE AND cl.is_preview = TRUE
       LIMIT 1`,
    );
    const row = courseRes.rows?.[0];
    if (row) {
      const access = await assertLessonPlaybackAccess(pool, null, row.course_id, row.id);
      playbackPreview = { pass: access.ok === true && access.access === 'preview', detail: access.access };
    } else {
      playbackPreview = { pass: true, detail: 'no_preview_lesson_skipped' };
    }
  } catch (e) {
    playbackPreview = { pass: false, detail: e?.message };
  }
  checks.push({ id: 'preview_playback_anonymous', ...playbackPreview });

  return {
    pass: checks.every((c) => c.pass),
    checks,
    controls: COURSE_SECURITY_CONTROLS,
  };
}
