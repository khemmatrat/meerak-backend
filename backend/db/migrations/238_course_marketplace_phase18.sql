-- 238: Course Marketplace Phase 18 — analytics funnel, admin audit, featured courses

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS featured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS featured_rank INT DEFAULT 0;

CREATE TABLE IF NOT EXISTS course_funnel_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  course_id VARCHAR(100) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  session_id VARCHAR(64),
  event_type VARCHAR(40) NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_funnel_events_course_type_time
  ON course_funnel_events(course_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_course_funnel_events_type_time
  ON course_funnel_events(event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_course_funnel_events_user_time
  ON course_funnel_events(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS course_marketplace_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id VARCHAR(100) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  admin_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(40) NOT NULL,
  before_status VARCHAR(30),
  after_status VARCHAR(30),
  reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_marketplace_audit_course
  ON course_marketplace_audit_log(course_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_courses_featured
  ON courses(is_marketplace, featured_rank DESC, featured_at DESC NULLS LAST)
  WHERE is_marketplace = TRUE AND status = 'published';
