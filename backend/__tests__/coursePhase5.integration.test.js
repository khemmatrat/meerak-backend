/**
 * Integration: review eligibility, unique review, rating_avg update.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  getEnrollmentReviewEligibility,
  getMyCourseReview,
  submitCourseReview,
  deleteCourseReview,
  listCourseReviews,
  MIN_REVIEW_PROGRESS_PCT,
} from '../lib/courseReviewService.js';
import {
  postCourseQaMessage,
  listCourseQaThreads,
  updateCourseQaMessage,
  deleteCourseQaMessage,
} from '../lib/courseQaService.js';
import { notifyInstructorNewQaQuestion } from '../lib/courseQaNotify.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const COURSE_ID = 'aqond-marketplace-free-preview';

function buildPool() {
  return new pg.Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_DATABASE || 'meera_db',
    user: process.env.DB_USER || 'meera',
    password: process.env.DB_PASSWORD || 'meera123',
    max: 3,
  });
}

test('review flow: progress gate, submit, rating stats, qa thread', async (t) => {
  const pool = buildPool();
  t.after(async () => {
    await pool.end();
  });

  try {
    await pool.query('SELECT 1');
  } catch {
    t.skip('PostgreSQL unavailable');
    return;
  }

  const courseRes = await pool.query(
    `SELECT id, instructor_user_id FROM courses WHERE id = $1 LIMIT 1`,
    [COURSE_ID],
  );
  if (!courseRes.rows?.[0]) {
    t.skip(`Course ${COURSE_ID} missing`);
    return;
  }

  const instructorId = courseRes.rows[0].instructor_user_id;
  const userRes = await pool.query(
    `SELECT id FROM users WHERE id <> $1::uuid ORDER BY created_at DESC LIMIT 1`,
    [instructorId],
  );
  const userId = userRes.rows?.[0]?.id;
  if (!userId) {
    t.skip('No test user');
    return;
  }

  await pool.query(
    `INSERT INTO course_enrollments (user_id, course_id, source, progress_pct)
     VALUES ($1::uuid, $2, 'phase5_test', 0)
     ON CONFLICT (user_id, course_id) DO UPDATE SET progress_pct = 0, completed_at = NULL`,
    [userId, COURSE_ID],
  );

  let eligibility = await getEnrollmentReviewEligibility(pool, userId, COURSE_ID);
  assert.equal(eligibility.canReview, false);
  assert.equal(eligibility.code, 'insufficient_progress');

  await pool.query(
    `UPDATE course_enrollments SET progress_pct = $3 WHERE user_id = $1::uuid AND course_id = $2`,
    [userId, COURSE_ID, MIN_REVIEW_PROGRESS_PCT],
  );

  eligibility = await getEnrollmentReviewEligibility(pool, userId, COURSE_ID);
  assert.equal(eligibility.canReview, true);

  const submit = await submitCourseReview(pool, userId, COURSE_ID, {
    rating: 4,
    comment: 'phase5 integration test',
  });
  assert.equal(submit.ok, true);
  assert.equal(submit.ratingCount >= 1, true);

  const resubmit = await submitCourseReview(pool, userId, COURSE_ID, {
    rating: 5,
    comment: 'updated review',
  });
  assert.equal(resubmit.ok, true);
  const mine = await getMyCourseReview(pool, userId, COURSE_ID);
  assert.equal(mine.rating, 5);

  const qa = await postCourseQaMessage(pool, userId, COURSE_ID, {
    body: 'คำถาม integration test?',
    lessonId: null,
  });
  assert.equal(qa.ok, true);

  if (instructorId) {
    const reply = await postCourseQaMessage(pool, instructorId, COURSE_ID, {
      body: 'คำตอบจากผู้สอน',
      parentId: qa.message.id,
    });
    assert.equal(reply.ok, true);
  }

  const listed = await listCourseQaThreads(pool, COURSE_ID, { limit: 10 });
  assert.ok(listed.total >= 1);
  assert.ok(listed.threads.some((th) => th.body.includes('integration test')));

  const page = await listCourseReviews(pool, COURSE_ID, { limit: 5, offset: 0, sort: 'rating_high' });
  assert.ok(Array.isArray(page.reviews));
  assert.equal(typeof page.total, 'number');
  assert.equal(page.sort, 'rating_high');

  const edited = await updateCourseQaMessage(pool, userId, COURSE_ID, qa.message.id, {
    body: 'คำถาม integration test (แก้ไขแล้ว)?',
  });
  assert.equal(edited.ok, true);

  const notifyCalls = [];
  const notifyMock = async (uid, title, msg) => {
    notifyCalls.push({ uid, title, msg });
  };
  await notifyInstructorNewQaQuestion(pool, notifyMock, {
    courseId: COURSE_ID,
    askerUserId: userId,
    askerName: 'Tester',
    questionPreview: 'แจ้งเตือนทดสอบ',
  });
  if (instructorId && String(instructorId) !== String(userId)) {
    assert.ok(notifyCalls.length >= 1);
    assert.match(notifyCalls[0].title, /คำถามใหม่/);
  }

  const deletedReview = await deleteCourseReview(pool, userId, COURSE_ID);
  assert.equal(deletedReview.ok, true);
  const afterDelete = await getMyCourseReview(pool, userId, COURSE_ID);
  assert.equal(afterDelete, null);

  await deleteCourseQaMessage(pool, userId, COURSE_ID, qa.message.id);
});
