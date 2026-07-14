/**
 * Course marketplace learning — progress, quiz, certificates, notes, streaks.
 */
import crypto from 'crypto';
import { trackCourseFunnelEvent } from './courseFunnelAnalytics.js';
import { mapLessonRow } from './courseMarketplaceShared.js';

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export function requiredWatchSeconds(lesson) {
  const explicit = Number(lesson?.watched_seconds_required || 0);
  if (explicit > 0) return explicit;
  const step = String(lesson?.step_type || lesson?.stepType || 'video').toLowerCase();
  if (step === 'quiz' || step === 'assignment') return 0;
  const durationSec = Math.max(0, Number(lesson?.duration_min || 0) * 60);
  if (durationSec <= 0) return 0;
  return Math.max(30, Math.floor(durationSec * 0.5));
}

export function canMarkLessonComplete({ lesson, watchedSeconds, completed }) {
  if (!completed) return { ok: true };
  const required = requiredWatchSeconds(lesson);
  if (required <= 0) return { ok: true };
  const watched = Number(watchedSeconds || 0);
  if (watched >= required) return { ok: true };
  return {
    ok: false,
    error: `ต้องเรียนอย่างน้อย ${Math.ceil(required / 60)} นาทีก่อนทำเครื่องหมายจบ (ดูแล้ว ${Math.floor(watched / 60)} นาที)`,
    code: 'watch_requirement_not_met',
    requiredSeconds: required,
    watchedSeconds: watched,
  };
}

export function isLessonSequentiallyLocked({ lessons, completedLessonIds, targetLessonId, sequentialUnlock }) {
  if (!sequentialUnlock) return false;
  const ordered = [...(lessons || [])].sort((a, b) => {
    const sa = Number(a.sort_order ?? a.sortOrder ?? 0);
    const sb = Number(b.sort_order ?? b.sortOrder ?? 0);
    return sa - sb;
  });
  const idx = ordered.findIndex((l) => String(l.id) === String(targetLessonId));
  if (idx <= 0) return false;
  for (let i = 0; i < idx; i += 1) {
    const lid = ordered[i].id;
    if (ordered[i].is_preview || ordered[i].isPreview) continue;
    if (!completedLessonIds.has(String(lid))) return true;
  }
  return false;
}

export async function loadCourseLessons(pool, courseId) {
  const r = await pool.query(
    `SELECT id, section_id, title, sort_order, step_type, video_url, text_content,
            duration_min, quiz_pass_percent, is_preview, resource_urls, watched_seconds_required
     FROM course_lessons WHERE course_id = $1 ORDER BY sort_order, created_at`,
    [courseId],
  );
  return (r.rows || []).map(mapLessonRow);
}

export async function computeProgressPct(pool, userId, courseId) {
  const totals = await pool.query(
    `SELECT
       (SELECT COUNT(*)::numeric FROM course_lessons WHERE course_id = $2) AS total,
       (SELECT COUNT(*)::numeric FROM course_lesson_progress
        WHERE user_id = $1::uuid AND course_id = $2 AND completed = TRUE) AS done`,
    [userId, courseId],
  );
  const total = Number(totals.rows?.[0]?.total || 0);
  const done = Number(totals.rows?.[0]?.done || 0);
  return total > 0 ? round2((done / total) * 100) : 0;
}

export async function updateEnrollmentProgress(pool, userId, courseId, { progressPct, lastLessonId = null } = {}) {
  const pct = round2(progressPct);
  const wasComplete = await pool.query(
    `SELECT completed_at FROM course_enrollments WHERE user_id = $1::uuid AND course_id = $2 LIMIT 1`,
    [userId, courseId],
  );
  const previouslyCompleted = !!wasComplete.rows?.[0]?.completed_at;

  await pool.query(
    `UPDATE course_enrollments
     SET progress_pct = $3::numeric,
         completed_at = CASE WHEN $3::numeric >= 100 THEN COALESCE(completed_at, NOW()) ELSE NULL END,
         last_lesson_id = COALESCE($4::uuid, last_lesson_id),
         last_activity_at = NOW()
     WHERE user_id = $1::uuid AND course_id = $2`,
    [userId, courseId, pct, lastLessonId || null],
  );

  await updateLearningStreak(pool, userId, courseId);

  if (pct >= 100 && !previouslyCompleted) {
    await issueCompletionCertificate(pool, userId, courseId);
    await trackCourseFunnelEvent(pool, {
      userId,
      courseId,
      eventType: 'course_completed',
      metadata: { progressPct: pct },
    });
    return { newlyCompleted: true };
  }
  return { newlyCompleted: false };
}

export async function updateLearningStreak(pool, userId, courseId) {
  const r = await pool.query(
    `SELECT learning_streak_days, last_activity_at FROM course_enrollments
     WHERE user_id = $1::uuid AND course_id = $2 LIMIT 1`,
    [userId, courseId],
  );
  const row = r.rows?.[0];
  if (!row) return;
  const last = row.last_activity_at ? new Date(row.last_activity_at) : null;
  let streak = Number(row.learning_streak_days || 0);
  const dayMs = 24 * 60 * 60 * 1000;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  if (!last) {
    streak = 1;
  } else {
    const lastStart = new Date(last);
    lastStart.setHours(0, 0, 0, 0);
    const diffDays = Math.round((todayStart.getTime() - lastStart.getTime()) / dayMs);
    if (diffDays === 0) {
      streak = Math.max(streak, 1);
    } else if (diffDays === 1) {
      streak += 1;
    } else {
      streak = 1;
    }
  }
  await pool.query(
    `UPDATE course_enrollments SET learning_streak_days = $3, last_activity_at = NOW()
     WHERE user_id = $1::uuid AND course_id = $2`,
    [userId, courseId, streak],
  );
}

function makeVerifyCode() {
  return crypto.randomBytes(6).toString('hex').toUpperCase();
}

export async function issueCompletionCertificate(pool, userId, courseId) {
  try {
    const existing = await pool.query(
      `SELECT id, verify_code, issued_at FROM course_completion_certificates
       WHERE user_id = $1::uuid AND course_id = $2 LIMIT 1`,
      [userId, courseId],
    );
    if (existing.rows?.[0]) return existing.rows[0];

    const course = await pool.query(`SELECT title FROM courses WHERE id = $1 LIMIT 1`, [courseId]);
    const user = await pool.query(`SELECT full_name, email FROM users WHERE id = $1::uuid LIMIT 1`, [userId]);
    const verifyCode = makeVerifyCode();
    const r = await pool.query(
      `INSERT INTO course_completion_certificates (user_id, course_id, verify_code, metadata)
       VALUES ($1::uuid, $2, $3, $4::jsonb)
       RETURNING id, verify_code, issued_at`,
      [
        userId,
        courseId,
        verifyCode,
        JSON.stringify({
          course_title: course.rows?.[0]?.title || courseId,
          learner_name: user.rows?.[0]?.full_name || user.rows?.[0]?.email || 'Learner',
        }),
      ],
    );
    return r.rows?.[0] || null;
  } catch (e) {
    console.warn('[courseLearning] certificate issue skipped:', e?.message);
    return null;
  }
}

export async function getCourseProgressState(pool, userId, courseId) {
  const [enrollment, progressRows, courseRow, notesRows, certRow] = await Promise.all([
    pool.query(
      `SELECT progress_pct, completed_at, last_lesson_id, learning_streak_days, last_activity_at
       FROM course_enrollments WHERE user_id = $1::uuid AND course_id = $2 LIMIT 1`,
      [userId, courseId],
    ),
    pool.query(
      `SELECT lesson_id, watched_seconds, completed, completed_at, updated_at
       FROM course_lesson_progress WHERE user_id = $1::uuid AND course_id = $2`,
      [userId, courseId],
    ),
    pool.query(
      `SELECT sequential_unlock FROM courses WHERE id = $1 AND is_marketplace = TRUE LIMIT 1`,
      [courseId],
    ),
    pool.query(
      `SELECT lesson_id, body, updated_at FROM course_lesson_notes
       WHERE user_id = $1::uuid AND course_id = $2`,
      [userId, courseId],
    ),
    pool.query(
      `SELECT id, verify_code, issued_at FROM course_completion_certificates
       WHERE user_id = $1::uuid AND course_id = $2 LIMIT 1`,
      [userId, courseId],
    ),
  ]);

  const enrollmentRow = enrollment.rows?.[0];
  const lessons = await loadCourseLessons(pool, courseId);
  const lessonProgress = {};
  const completedLessonIds = [];
  for (const row of progressRows.rows || []) {
    lessonProgress[row.lesson_id] = {
      watchedSeconds: Number(row.watched_seconds || 0),
      completed: !!row.completed,
      completedAt: row.completed_at,
      updatedAt: row.updated_at,
    };
    if (row.completed) completedLessonIds.push(String(row.lesson_id));
  }

  const notes = {};
  for (const row of notesRows.rows || []) {
    notes[row.lesson_id] = { body: row.body || '', updatedAt: row.updated_at };
  }

  let lastLessonId = enrollmentRow?.last_lesson_id || null;
  if (!lastLessonId && completedLessonIds.length && lessons.length) {
    const incomplete = lessons.find((l) => !completedLessonIds.includes(String(l.id)));
    lastLessonId = incomplete?.id || lessons[lessons.length - 1]?.id || null;
  }

  return {
    enrolled: !!enrollmentRow,
    progressPct: Number(enrollmentRow?.progress_pct || 0),
    completedAt: enrollmentRow?.completed_at || null,
    lastLessonId,
    learningStreakDays: Number(enrollmentRow?.learning_streak_days || 0),
    lastActivityAt: enrollmentRow?.last_activity_at || null,
    sequentialUnlock: !!courseRow.rows?.[0]?.sequential_unlock,
    completedLessonIds,
    lessonProgress,
    notes,
    certificate: certRow.rows?.[0]
      ? {
          id: certRow.rows[0].id,
          verifyCode: certRow.rows[0].verify_code,
          issuedAt: certRow.rows[0].issued_at,
        }
      : null,
  };
}

export async function saveLessonProgress(pool, userId, courseId, { lessonId, watchedSeconds = 0, completed = false }) {
  const enrolled = await pool.query(
    `SELECT 1 FROM course_enrollments WHERE user_id = $1::uuid AND course_id = $2 LIMIT 1`,
    [userId, courseId],
  );
  if (!enrolled.rows?.[0]) {
    return { ok: false, httpStatus: 403, error: 'Enroll before learning', code: 'not_enrolled' };
  }

  const lessonRes = await pool.query(
    `SELECT * FROM course_lessons WHERE id = $1::uuid AND course_id = $2 LIMIT 1`,
    [lessonId, courseId],
  );
  const lesson = lessonRes.rows?.[0];
  if (!lesson) return { ok: false, httpStatus: 404, error: 'Lesson not found' };

  const courseRes = await pool.query(`SELECT sequential_unlock FROM courses WHERE id = $1 LIMIT 1`, [courseId]);
  const lessons = await loadCourseLessons(pool, courseId);
  const progressState = await getCourseProgressState(pool, userId, courseId);
  const completedSet = new Set(progressState.completedLessonIds);

  if (isLessonSequentiallyLocked({
    lessons,
    completedLessonIds: completedSet,
    targetLessonId: lessonId,
    sequentialUnlock: !!courseRes.rows?.[0]?.sequential_unlock,
  })) {
    return { ok: false, httpStatus: 403, error: 'เรียนบทก่อนหน้าให้จบก่อน', code: 'sequential_locked' };
  }

  const watchCheck = canMarkLessonComplete({ lesson, watchedSeconds, completed });
  if (!watchCheck.ok) {
    return { ok: false, httpStatus: 400, error: watchCheck.error, code: watchCheck.code, ...watchCheck };
  }

  await pool.query(
    `INSERT INTO course_lesson_progress (user_id, course_id, lesson_id, watched_seconds, completed, completed_at, updated_at)
     VALUES ($1::uuid,$2,$3::uuid,$4,$5,CASE WHEN $5 THEN NOW() ELSE NULL END,NOW())
     ON CONFLICT (user_id, lesson_id) DO UPDATE SET
       watched_seconds = GREATEST(course_lesson_progress.watched_seconds, EXCLUDED.watched_seconds),
       completed = course_lesson_progress.completed OR EXCLUDED.completed,
       completed_at = COALESCE(course_lesson_progress.completed_at, EXCLUDED.completed_at),
       updated_at = NOW()`,
    [userId, courseId, lessonId, Number(watchedSeconds || 0), !!completed],
  );

  const progressPct = await computeProgressPct(pool, userId, courseId);
  const completion = await updateEnrollmentProgress(pool, userId, courseId, {
    progressPct,
    lastLessonId: lessonId,
  });

  if (completed) {
    await trackCourseFunnelEvent(pool, {
      userId,
      courseId,
      eventType: 'course_lesson_completed',
      metadata: { lessonId, progressPct },
    });
  }

  const state = await getCourseProgressState(pool, userId, courseId);
  return {
    ok: true,
    progressPct,
    newlyCompleted: completion.newlyCompleted,
    certificate: state.certificate,
    ...state,
  };
}

export function scoreQuizAnswers(questions, answers) {
  const qs = Array.isArray(questions) ? questions : [];
  if (!qs.length) return { score: 0, passed: false, total: 0, correct: 0 };
  let correct = 0;
  for (const q of qs) {
    const ans = answers?.[q.id];
    const correctId = q.correct_option_id || q.correctOptionId;
    if (ans != null && String(ans) === String(correctId)) correct += 1;
  }
  const total = qs.length;
  const score = total > 0 ? round2((correct / total) * 100) : 0;
  return { score, correct, total };
}

export async function submitLessonQuiz(pool, userId, courseId, lessonId, answers = {}) {
  const lessonRes = await pool.query(
    `SELECT * FROM course_lessons WHERE id = $1::uuid AND course_id = $2 LIMIT 1`,
    [lessonId, courseId],
  );
  const lesson = lessonRes.rows?.[0];
  if (!lesson) return { ok: false, httpStatus: 404, error: 'Lesson not found' };

  const qRes = await pool.query(
    `SELECT id, question_text, options, correct_option_id FROM course_questions
     WHERE course_id = $1 ORDER BY sort_order, id`,
    [courseId],
  );
  const questions = qRes.rows || [];
  if (!questions.length) return { ok: false, httpStatus: 400, error: 'ยังไม่มีคำถาม quiz ในคอร์สนี้' };

  const { score, correct, total } = scoreQuizAnswers(questions, answers);
  const passThreshold = Number(lesson.quiz_pass_percent || 70);
  const passed = score >= passThreshold;

  await pool.query(
    `INSERT INTO course_quiz_attempts (user_id, course_id, lesson_id, score, passed, answers)
     VALUES ($1::uuid,$2,$3::uuid,$4,$5,$6::jsonb)`,
    [userId, courseId, lessonId, score, passed, JSON.stringify(answers || {})],
  );

  let progressResult = null;
  if (passed) {
    progressResult = await saveLessonProgress(pool, userId, courseId, {
      lessonId,
      watchedSeconds: 0,
      completed: true,
    });
  }

  const attemptsRes = await pool.query(
    `SELECT COUNT(*)::int AS n FROM course_quiz_attempts
     WHERE user_id = $1::uuid AND lesson_id = $2::uuid`,
    [userId, lessonId],
  );

  return {
    ok: true,
    score,
    correct,
    total,
    passed,
    passThreshold,
    attempts: Number(attemptsRes.rows?.[0]?.n || 0),
    progress: progressResult?.ok ? progressResult : null,
  };
}

export async function upsertLessonNote(pool, userId, courseId, lessonId, body) {
  const enrolled = await pool.query(
    `SELECT 1 FROM course_enrollments WHERE user_id = $1::uuid AND course_id = $2 LIMIT 1`,
    [userId, courseId],
  );
  if (!enrolled.rows?.[0]) return { ok: false, httpStatus: 403, error: 'Enroll before taking notes' };

  const r = await pool.query(
    `INSERT INTO course_lesson_notes (user_id, course_id, lesson_id, body, updated_at)
     VALUES ($1::uuid,$2,$3::uuid,$4,NOW())
     ON CONFLICT (user_id, lesson_id) DO UPDATE SET body = EXCLUDED.body, updated_at = NOW()
     RETURNING lesson_id, body, updated_at`,
    [userId, courseId, lessonId, String(body || '').slice(0, 8000)],
  );
  return { ok: true, note: r.rows?.[0] };
}

export async function getContinueLearningCourses(pool, userId, limit = 6) {
  const r = await pool.query(
    `SELECT e.*, c.title, c.subtitle, c.image_url, c.instructor_user_id, u.full_name AS instructor_name
     FROM course_enrollments e
     JOIN courses c ON c.id = e.course_id
     LEFT JOIN users u ON u.id = c.instructor_user_id
     WHERE e.user_id = $1::uuid
       AND c.is_marketplace = TRUE
       AND c.status = 'published'
       AND COALESCE(e.progress_pct, 0) < 100
     ORDER BY e.last_activity_at DESC NULLS LAST, e.enrolled_at DESC
     LIMIT $2`,
    [userId, limit],
  );
  return (r.rows || []).map((row) => ({
    courseId: row.course_id,
    title: row.title,
    subtitle: row.subtitle || '',
    imageUrl: row.image_url || '',
    instructorName: row.instructor_name || '',
    progressPct: Number(row.progress_pct || 0),
    lastLessonId: row.last_lesson_id,
    learningStreakDays: Number(row.learning_streak_days || 0),
    lastActivityAt: row.last_activity_at,
  }));
}

export async function getCoachTraineeCourseProgress(pool, coachId) {
  const r = await pool.query(
    `SELECT
       c.id AS connection_id,
       u.id AS trainee_id,
       u.full_name AS trainee_name,
       u.email AS trainee_email,
       ce.course_id,
       co.title AS course_title,
       ce.progress_pct,
       ce.completed_at,
       ce.last_lesson_id,
       ce.last_activity_at,
       ce.learning_streak_days
     FROM coach_trainee_connections c
     JOIN users u ON u.id = c.trainee_id
     LEFT JOIN course_enrollments ce ON ce.user_id = u.id
     LEFT JOIN courses co ON co.id = ce.course_id AND co.is_marketplace = TRUE
     WHERE c.coach_id = $1::uuid AND c.status = 'active'
     ORDER BY u.full_name, co.title NULLS LAST`,
    [coachId],
  );
  const byTrainee = new Map();
  for (const row of r.rows || []) {
    const tid = String(row.trainee_id);
    if (!byTrainee.has(tid)) {
      byTrainee.set(tid, {
        traineeId: tid,
        traineeName: row.trainee_name,
        traineeEmail: row.trainee_email,
        connectionId: row.connection_id,
        courses: [],
      });
    }
    if (row.course_id) {
      byTrainee.get(tid).courses.push({
        courseId: row.course_id,
        courseTitle: row.course_title,
        progressPct: Number(row.progress_pct || 0),
        completedAt: row.completed_at,
        lastLessonId: row.last_lesson_id,
        lastActivityAt: row.last_activity_at,
        learningStreakDays: Number(row.learning_streak_days || 0),
      });
    }
  }
  return [...byTrainee.values()];
}

export async function getUserCourseBadges(pool, userId) {
  const r = await pool.query(
    `SELECT c.id, c.title, c.learning_outcomes, e.completed_at, cert.verify_code
     FROM course_enrollments e
     JOIN courses c ON c.id = e.course_id
     LEFT JOIN course_completion_certificates cert
       ON cert.user_id = e.user_id AND cert.course_id = e.course_id
     WHERE e.user_id = $1::uuid
       AND c.is_marketplace = TRUE
       AND e.progress_pct >= 100
     ORDER BY e.completed_at DESC NULLS LAST`,
    [userId],
  );
  return (r.rows || []).map((row) => ({
    courseId: row.id,
    courseTitle: row.title,
    completedAt: row.completed_at,
    verifyCode: row.verify_code || null,
    outcomes: (() => {
      try {
        const raw = row.learning_outcomes;
        return Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
      } catch {
        return [];
      }
    })(),
  }));
}

export function mapQuizForClient(questions, lessonTitle, passThreshold) {
  return {
    id: 'course-quiz',
    title: lessonTitle || 'แบบทดสอบ',
    passThreshold: Number(passThreshold || 70),
    questions: (questions || []).map((q) => ({
      id: q.id,
      text: q.question_text,
      type: 'mcq',
      options: (Array.isArray(q.options) ? q.options : []).map((o) => ({
        id: o.id,
        text: o.text,
      })),
    })),
  };
}
