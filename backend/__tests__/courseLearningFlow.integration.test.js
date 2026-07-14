/**
 * Integration: enroll → complete lessons → certificate (DB-level, no HTTP server required).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  loadCourseLessons,
  saveLessonProgress,
  getCourseProgressState,
} from '../lib/courseLearningService.js';
import { redactLessonForViewer } from '../lib/courseLessonPlayback.js';

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

test('learning flow: enroll, complete all lessons, issue certificate', async (t) => {
  const pool = buildPool();
  t.after(async () => {
    await pool.end();
  });

  let connected = false;
  try {
    await pool.query('SELECT 1');
    connected = true;
  } catch {
    t.skip('PostgreSQL unavailable — skip integration test');
    return;
  }
  if (!connected) return;

  const courseRes = await pool.query(
    `SELECT id, instructor_user_id FROM courses WHERE id = $1 AND is_marketplace = TRUE AND status = 'published' LIMIT 1`,
    [COURSE_ID],
  );
  if (!courseRes.rows?.[0]) {
    t.skip(`Demo course ${COURSE_ID} missing — run migration 241`);
    return;
  }

  const instructorId = courseRes.rows[0].instructor_user_id;
  const userRes = await pool.query(
    `SELECT id FROM users WHERE id IS NOT NULL AND ($1::uuid IS NULL OR id <> $1::uuid)
     ORDER BY created_at DESC LIMIT 1`,
    [instructorId],
  );
  const userId = userRes.rows?.[0]?.id;
  if (!userId) {
    t.skip('No suitable test user in DB');
    return;
  }

  await pool.query(
    `INSERT INTO course_enrollments (user_id, course_id, source)
     VALUES ($1::uuid, $2, 'integration_test')
     ON CONFLICT (user_id, course_id) DO NOTHING`,
    [userId, COURSE_ID],
  );

  const lessons = await loadCourseLessons(pool, COURSE_ID);
  assert.ok(lessons.length >= 1, 'course should have lessons');

  for (const lesson of lessons) {
    const redacted = redactLessonForViewer(lesson, { allowVideoUrl: false });
    assert.equal(redacted.videoUrl, undefined, 'marketplace lesson JSON must not leak video URL');

    const required = Math.max(60, Number(lesson.durationMin || 0) * 30);
    const result = await saveLessonProgress(pool, userId, COURSE_ID, {
      lessonId: lesson.id,
      watchedSeconds: required,
      completed: true,
    });
    assert.equal(result.ok, true, `lesson ${lesson.id} should save`);
  }

  const state = await getCourseProgressState(pool, userId, COURSE_ID);
  assert.equal(state.progressPct, 100);
  assert.ok(state.certificate?.verifyCode, 'certificate verify code should exist');

  const certRow = await pool.query(
    `SELECT verify_code FROM course_completion_certificates WHERE user_id = $1::uuid AND course_id = $2 LIMIT 1`,
    [userId, COURSE_ID],
  );
  assert.ok(certRow.rows?.[0]?.verify_code);
});
