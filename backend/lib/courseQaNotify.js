/**
 * Notify course instructor when a new Q&A question is posted (root thread only).
 */
export async function notifyInstructorNewQaQuestion(
  pool,
  notifyUser,
  {
    courseId,
    askerUserId,
    askerName,
    lessonId = null,
    questionPreview = '',
  },
) {
  if (typeof notifyUser !== 'function') return { skipped: true, reason: 'no_notifier' };

  const courseRes = await pool.query(
    `SELECT title, instructor_user_id FROM courses WHERE id = $1 LIMIT 1`,
    [courseId],
  );
  const course = courseRes.rows?.[0];
  const instructorId = course?.instructor_user_id;
  if (!instructorId || String(instructorId) === String(askerUserId)) {
    return { skipped: true, reason: 'no_instructor_or_self' };
  }

  let lessonTitle = '';
  if (lessonId) {
    const lr = await pool.query(`SELECT title FROM course_lessons WHERE id = $1::uuid LIMIT 1`, [lessonId]);
    lessonTitle = lr.rows?.[0]?.title || '';
  }

  const courseTitle = course?.title || 'คอร์สของคุณ';
  const snippet = String(questionPreview || '').trim().slice(0, 80);
  const title = 'มีคำถามใหม่ในคอร์สของคุณ';
  const message = lessonTitle
    ? `${askerName || 'ผู้เรียน'} ถามใน "${courseTitle}" · ${lessonTitle}${snippet ? `: ${snippet}` : ''}`
    : `${askerName || 'ผู้เรียน'} ถามใน "${courseTitle}"${snippet ? `: ${snippet}` : ''}`;

  const deepLink = lessonId
    ? `/courses/${courseId}/learn?lesson=${lessonId}`
    : `/courses/${courseId}`;

  await notifyUser(String(instructorId), title, message, {
    fcm: {
      data: {
        deep_link: deepLink,
        notification_type: 'course_qa_question',
        course_id: courseId,
      },
    },
  });

  return { ok: true, instructorId: String(instructorId) };
}
