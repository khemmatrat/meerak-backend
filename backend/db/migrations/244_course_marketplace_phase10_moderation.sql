-- 244: Course Marketplace Phase 10 — moderation, per-course platform rate, audit

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS platform_rate_override NUMERIC(5,4);

COMMENT ON COLUMN courses.platform_rate_override IS 'Optional per-course platform fee rate (0–0.9); NULL = global policy';

ALTER TABLE course_reviews
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS moderation_reason TEXT,
  ADD COLUMN IF NOT EXISTS moderated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ;

ALTER TABLE course_questions_qa
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS moderation_reason TEXT,
  ADD COLUMN IF NOT EXISTS moderated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_course_reviews_hidden
  ON course_reviews (course_id, is_hidden, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_course_qa_moderation
  ON course_questions_qa (course_id, is_hidden, is_closed, created_at DESC);
