/**
 * Coach → trainee course recommendations (Phase 7).
 */
export async function assertActiveCoachTraineeLink(pool, coachId, traineeId) {
  if (!coachId || !traineeId) {
    return { ok: false, httpStatus: 400, error: 'coach and trainee required', code: 'missing_ids' };
  }
  if (String(coachId) === String(traineeId)) {
    return { ok: false, httpStatus: 400, error: 'ไม่สามารถแนะนำให้ตัวเอง', code: 'self_trainee' };
  }
  const r = await pool.query(
    `SELECT id FROM coach_trainee_connections
     WHERE coach_id = $1::uuid AND trainee_id = $2::uuid AND status = 'active'
     LIMIT 1`,
    [coachId, traineeId],
  );
  if (!r.rows?.[0]) {
    return {
      ok: false,
      httpStatus: 403,
      error: 'แนะนำได้เฉพาะศิษย์ที่เชื่อมต่อ active',
      code: 'not_linked_trainee',
    };
  }
  return { ok: true, connectionId: r.rows[0].id };
}

export async function recommendCourseToTrainee(pool, coachId, courseId, traineeId, note = '') {
  const link = await assertActiveCoachTraineeLink(pool, coachId, traineeId);
  if (!link.ok) return link;

  const courseRes = await pool.query(
    `SELECT id, title, status, is_marketplace FROM courses WHERE id = $1 LIMIT 1`,
    [courseId],
  );
  const course = courseRes.rows?.[0];
  if (!course?.is_marketplace || course.status !== 'published') {
    return { ok: false, httpStatus: 404, error: 'Course not found', code: 'course_not_found' };
  }

  const r = await pool.query(
    `INSERT INTO course_recommendations (coach_id, trainee_id, course_id, note)
     VALUES ($1::uuid, $2::uuid, $3, $4)
     ON CONFLICT (coach_id, trainee_id, course_id) DO UPDATE SET
       note = EXCLUDED.note,
       created_at = NOW()
     RETURNING *`,
    [coachId, traineeId, courseId, String(note || '').slice(0, 500)],
  );

  return { ok: true, recommendation: r.rows[0], courseTitle: course.title };
}
