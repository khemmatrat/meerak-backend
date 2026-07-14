/**
 * Course marketplace Q&A — threads under course/lesson.
 */
const MAX_BODY_LEN = 4000;

export function mapQaRow(row, { instructorUserId = null } = {}) {
  return {
    id: row.id,
    courseId: row.course_id,
    lessonId: row.lesson_id,
    userId: row.user_id,
    userName: row.user_name || row.full_name || 'ผู้เรียน',
    parentId: row.parent_id,
    body: row.body,
    isInstructor: instructorUserId && String(row.user_id) === String(instructorUserId),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function buildQaThreads(flatRows, instructorUserId) {
  const mapped = (flatRows || []).map((r) => mapQaRow(r, { instructorUserId }));
  const byId = new Map(mapped.map((m) => [String(m.id), { ...m, replies: [] }]));
  const roots = [];
  for (const item of byId.values()) {
    if (item.parentId) {
      const parent = byId.get(String(item.parentId));
      if (parent) parent.replies.push(item);
      else roots.push(item);
    } else {
      roots.push(item);
    }
  }
  for (const root of roots) {
    root.replies.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }
  roots.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return roots;
}

export async function loadCourseInstructorId(pool, courseId) {
  const r = await pool.query(
    `SELECT instructor_user_id FROM courses WHERE id = $1 AND is_marketplace = TRUE LIMIT 1`,
    [courseId],
  );
  return r.rows?.[0]?.instructor_user_id || null;
}

export async function isUserEnrolled(pool, userId, courseId) {
  if (!userId) return false;
  const r = await pool.query(
    `SELECT 1 FROM course_enrollments WHERE user_id = $1::uuid AND course_id = $2 LIMIT 1`,
    [userId, courseId],
  );
  return !!r.rows?.[0];
}

export async function listCourseQaThreads(pool, courseId, { lessonId = null, limit = 50 } = {}) {
  const instructorUserId = await loadCourseInstructorId(pool, courseId);
  const cap = Math.min(Math.max(Number(limit) || 50, 1), 100);

  const r = await pool.query(
    `WITH roots AS (
       SELECT id FROM course_questions_qa
       WHERE course_id = $1 AND parent_id IS NULL
         AND is_hidden IS NOT TRUE
         AND ($2::uuid IS NULL OR lesson_id = $2::uuid)
       ORDER BY created_at DESC
       LIMIT $3
     )
     SELECT q.*, u.full_name AS user_name
     FROM course_questions_qa q
     JOIN users u ON u.id = q.user_id
     WHERE q.course_id = $1
       AND q.is_hidden IS NOT TRUE
       AND (q.id IN (SELECT id FROM roots) OR q.parent_id IN (SELECT id FROM roots))
     ORDER BY q.created_at ASC`,
    [courseId, lessonId || null, cap],
  );

  const threads = buildQaThreads(r.rows || [], instructorUserId);
  const totalParams = [courseId];
  let totalFilter = '';
  if (lessonId) {
    totalParams.push(lessonId);
    totalFilter = ' AND lesson_id = $2::uuid';
  }
  const totalRes = await pool.query(
    `SELECT COUNT(*)::int AS n FROM course_questions_qa WHERE course_id = $1 AND parent_id IS NULL AND is_hidden IS NOT TRUE${totalFilter}`,
    totalParams,
  );
  return {
    threads,
    total: Number(totalRes.rows?.[0]?.n || 0),
    instructorUserId,
  };
}

export async function evaluateQaPostGate(pool, userId, courseId, { parentId = null, lessonId = null } = {}) {
  if (!userId) {
    return { ok: false, httpStatus: 401, error: 'Login required', code: 'auth_required' };
  }

  const courseRes = await pool.query(
    `SELECT id, instructor_user_id, status, is_marketplace FROM courses WHERE id = $1 LIMIT 1`,
    [courseId],
  );
  const course = courseRes.rows?.[0];
  if (!course?.is_marketplace || course.status !== 'published') {
    return { ok: false, httpStatus: 404, error: 'Course not found', code: 'course_not_found' };
  }

  const instructorUserId = course.instructor_user_id;
  const isInstructor = instructorUserId && String(instructorUserId) === String(userId);
  const enrolled = await isUserEnrolled(pool, userId, courseId);

  if (!parentId) {
    if (!enrolled && !isInstructor) {
      return {
        ok: false,
        httpStatus: 403,
        error: 'ลงทะเบียนคอร์สก่อนถามคำถาม',
        code: 'not_enrolled',
      };
    }
    if (lessonId) {
      const lessonOk = await pool.query(
        `SELECT 1 FROM course_lessons WHERE id = $1::uuid AND course_id = $2 LIMIT 1`,
        [lessonId, courseId],
      );
      if (!lessonOk.rows?.[0]) {
        return { ok: false, httpStatus: 404, error: 'Lesson not found', code: 'lesson_not_found' };
      }
    }
    return { ok: true, course, instructorUserId, role: isInstructor ? 'instructor' : 'student' };
  }

  const parentRes = await pool.query(
    `SELECT id, course_id, user_id, lesson_id, is_closed FROM course_questions_qa WHERE id = $1::uuid AND course_id = $2 LIMIT 1`,
    [parentId, courseId],
  );
  if (!parentRes.rows?.[0]) {
    return { ok: false, httpStatus: 404, error: 'Thread not found', code: 'parent_not_found' };
  }
  if (parentRes.rows[0].is_closed === true) {
    return { ok: false, httpStatus: 403, error: 'กระทู้นี้ถูกปิดแล้ว', code: 'thread_closed' };
  }

  if (!isInstructor && !enrolled) {
    return {
      ok: false,
      httpStatus: 403,
      error: 'เฉพาะผู้เรียนหรือผู้สอนตอบใน Q&A ได้',
      code: 'reply_denied',
    };
  }

  return { ok: true, course, instructorUserId, role: isInstructor ? 'instructor' : 'student', parent: parentRes.rows[0] };
}

export async function postCourseQaMessage(pool, userId, courseId, { body, lessonId = null, parentId = null } = {}) {
  const text = String(body || '').trim();
  if (text.length < 3) {
    return { ok: false, httpStatus: 400, error: 'ข้อความสั้นเกินไป (อย่างน้อย 3 ตัวอักษร)', code: 'body_too_short' };
  }
  if (text.length > MAX_BODY_LEN) {
    return { ok: false, httpStatus: 400, error: 'ข้อความยาวเกินไป', code: 'body_too_long' };
  }

  const gate = await evaluateQaPostGate(pool, userId, courseId, { parentId, lessonId });
  if (!gate.ok) return gate;

  const effectiveLessonId = parentId ? gate.parent?.lesson_id || lessonId : lessonId;

  const r = await pool.query(
    `INSERT INTO course_questions_qa (course_id, lesson_id, user_id, parent_id, body)
     VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5)
     RETURNING *`,
    [courseId, effectiveLessonId || null, userId, parentId || null, text],
  );

  const userRes = await pool.query(`SELECT full_name FROM users WHERE id = $1::uuid`, [userId]);
  const row = { ...r.rows[0], user_name: userRes.rows?.[0]?.full_name };
  return {
    ok: true,
    message: mapQaRow(row, { instructorUserId: gate.instructorUserId }),
    isNewRootQuestion: !parentId,
    instructorUserId: gate.instructorUserId,
    askerName: userRes.rows?.[0]?.full_name,
  };
}

export async function getCourseQaMessage(pool, courseId, messageId) {
  const r = await pool.query(
    `SELECT q.*, u.full_name AS user_name
     FROM course_questions_qa q
     JOIN users u ON u.id = q.user_id
     WHERE q.id = $1::uuid AND q.course_id = $2
     LIMIT 1`,
    [messageId, courseId],
  );
  return r.rows?.[0] || null;
}

export async function updateCourseQaMessage(pool, userId, courseId, messageId, { body } = {}) {
  const text = String(body || '').trim();
  if (text.length < 3) {
    return { ok: false, httpStatus: 400, error: 'ข้อความสั้นเกินไป', code: 'body_too_short' };
  }
  if (text.length > MAX_BODY_LEN) {
    return { ok: false, httpStatus: 400, error: 'ข้อความยาวเกินไป', code: 'body_too_long' };
  }

  const row = await getCourseQaMessage(pool, courseId, messageId);
  if (!row) return { ok: false, httpStatus: 404, error: 'Message not found', code: 'not_found' };
  if (String(row.user_id) !== String(userId)) {
    return { ok: false, httpStatus: 403, error: 'แก้ไขได้เฉพาะข้อความของตัวเอง', code: 'not_owner' };
  }

  const instructorUserId = await loadCourseInstructorId(pool, courseId);
  const updated = await pool.query(
    `UPDATE course_questions_qa SET body = $3, updated_at = NOW()
     WHERE id = $1::uuid AND course_id = $2
     RETURNING *`,
    [messageId, courseId, text],
  );
  const out = { ...updated.rows[0], user_name: row.user_name };
  return { ok: true, message: mapQaRow(out, { instructorUserId }) };
}

export async function deleteCourseQaMessage(pool, userId, courseId, messageId) {
  const row = await getCourseQaMessage(pool, courseId, messageId);
  if (!row) return { ok: false, httpStatus: 404, error: 'Message not found', code: 'not_found' };
  if (String(row.user_id) !== String(userId)) {
    return { ok: false, httpStatus: 403, error: 'ลบได้เฉพาะข้อความของตัวเอง', code: 'not_owner' };
  }

  await pool.query(`DELETE FROM course_questions_qa WHERE id = $1::uuid AND course_id = $2`, [
    messageId,
    courseId,
  ]);
  return { ok: true };
}
