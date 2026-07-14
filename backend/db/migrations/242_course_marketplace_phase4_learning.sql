-- 242: Course Marketplace Phase 4 — learning progress, certificates, notes, quiz attempts, streaks

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS sequential_unlock BOOLEAN DEFAULT FALSE;

ALTER TABLE course_enrollments
  ADD COLUMN IF NOT EXISTS last_lesson_id UUID REFERENCES course_lessons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS learning_streak_days INT DEFAULT 0;

CREATE TABLE IF NOT EXISTS course_completion_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id VARCHAR(100) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  verify_code VARCHAR(24) NOT NULL UNIQUE,
  issued_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_course_completion_certificates_verify
  ON course_completion_certificates(verify_code);

CREATE TABLE IF NOT EXISTS course_lesson_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id VARCHAR(100) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  body TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_course_lesson_notes_user_course
  ON course_lesson_notes(user_id, course_id);

CREATE TABLE IF NOT EXISTS course_quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id VARCHAR(100) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  score NUMERIC(5,2) NOT NULL DEFAULT 0,
  passed BOOLEAN NOT NULL DEFAULT FALSE,
  answers JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_quiz_attempts_user_lesson
  ON course_quiz_attempts(user_id, lesson_id, created_at DESC);
