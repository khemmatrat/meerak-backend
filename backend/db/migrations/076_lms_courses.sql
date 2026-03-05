-- =================================================================================
-- 076: LMS Courses — Training Center Database Schema
-- =================================================================================
-- courses, course_lessons, course_questions for Module 1 & 2
-- assignment_submissions for Module 3 manual grading
-- Integrates with user_exam_results and exam_module_config (no data loss)
-- =================================================================================

-- 1. courses — replaces MOCK_COURSES
CREATE TABLE IF NOT EXISTS courses (
  id VARCHAR(100) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  duration VARCHAR(50),
  level VARCHAR(20) DEFAULT 'beginner',
  image_url TEXT,
  -- Nexus mapping: module 1/2/3 for user_exam_results compatibility
  nexus_module SMALLINT,
  job_category VARCHAR(100),
  -- Override exam_module_config (nullable = use exam_module_config)
  pass_percent SMALLINT,
  time_limit_min SMALLINT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_courses_nexus_module ON courses(nexus_module);
CREATE INDEX IF NOT EXISTS idx_courses_job_category ON courses(job_category) WHERE job_category IS NOT NULL;

COMMENT ON TABLE courses IS 'LMS courses; nexus_module links to user_exam_results.module';

-- 2. course_lessons — step builder (Video -> Text -> Quiz -> Assignment)
CREATE TABLE IF NOT EXISTS course_lessons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id VARCHAR(100) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  step_type VARCHAR(20) NOT NULL CHECK (step_type IN ('video','text','quiz','assignment')),
  video_url TEXT,
  text_content TEXT,
  duration_min INT,
  -- For quiz step: override course pass_percent
  quiz_pass_percent SMALLINT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_course_lessons_course ON course_lessons(course_id);

COMMENT ON COLUMN course_lessons.step_type IS 'video=watch, text=read, quiz=test, assignment=submit for manual grading';

-- 3. course_questions — Question Bank for Module 1 & 2
CREATE TABLE IF NOT EXISTS course_questions (
  id VARCHAR(80) PRIMARY KEY,
  course_id VARCHAR(100) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  options JSONB NOT NULL,
  correct_option_id VARCHAR(10) NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_course_questions_course ON course_questions(course_id);

-- 4. assignment_submissions — Module 3 manual grading
CREATE TABLE IF NOT EXISTS assignment_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  file_urls JSONB DEFAULT '[]',
  submitted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','passed','failed')),
  admin_feedback TEXT,
  graded_by UUID REFERENCES users(id),
  graded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_assignment_submissions_user ON assignment_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_lesson ON assignment_submissions(lesson_id);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_status ON assignment_submissions(status) WHERE status = 'pending';

-- 5. Add course_id to user_exam_results (backward compatible)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_exam_results' AND column_name = 'course_id'
  ) THEN
    ALTER TABLE user_exam_results ADD COLUMN course_id VARCHAR(100) REFERENCES courses(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_exam_results_course ON user_exam_results(course_id) WHERE course_id IS NOT NULL;

-- 6. Ensure system_event_log exists (074)
CREATE TABLE IF NOT EXISTS system_event_log (
  id BIGSERIAL PRIMARY KEY,
  actor_type VARCHAR(20) NOT NULL,
  actor_id TEXT,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id TEXT,
  state_before JSONB,
  state_after JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_system_event_actor ON system_event_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_system_event_action ON system_event_log(action);
CREATE INDEX IF NOT EXISTS idx_system_event_created ON system_event_log(created_at DESC);

-- 7. Seed nexus-professional-standards (Module 1)
INSERT INTO courses (id, title, description, category, duration, level, image_url, nexus_module, pass_percent, time_limit_min, updated_at)
VALUES (
  'nexus-professional-standards',
  'มาตรฐานการบริการและความปลอดภัยของ Nexus',
  'เรียนรู้มาตรฐานการให้บริการและความปลอดภัยที่ Nexus กำหนดให้ Provider ทุกคนต้องผ่านก่อนรับงาน',
  'Professional Standards',
  'ประมาณ 30 นาที',
  'required',
  'https://images.unsplash.com/photo-1581578731548-c64695cc6952',
  1,
  85,
  45,
  CURRENT_TIMESTAMP
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  updated_at = CURRENT_TIMESTAMP;

-- 8. Seed Module 1 lessons (video + quiz)
INSERT INTO course_lessons (id, course_id, title, sort_order, step_type, video_url, duration_min)
SELECT gen_random_uuid(), 'nexus-professional-standards', 'มาตรฐานการบริการและความปลอดภัย', 0, 'video', 'https://www.youtube.com/watch?v=9ZvxbM5oTWE', 15
WHERE NOT EXISTS (SELECT 1 FROM course_lessons WHERE course_id = 'nexus-professional-standards' AND sort_order = 0);

INSERT INTO course_lessons (id, course_id, title, sort_order, step_type, quiz_pass_percent)
SELECT gen_random_uuid(), 'nexus-professional-standards', 'แบบทดสอบ Module 1', 1, 'quiz', 85
WHERE NOT EXISTS (SELECT 1 FROM course_lessons WHERE course_id = 'nexus-professional-standards' AND sort_order = 1);

-- 9. Seed nexus-module3 (Module 3)
INSERT INTO courses (id, title, description, category, duration, level, nexus_module, updated_at)
VALUES (
  'nexus-module3',
  'Module 3 — ทัศนคติและแนวทางปฏิบัติ (Scenario)',
  'การประเมินทัศนคติและแนวทางปฏิบัติผ่านสถานการณ์จำลอง',
  'Professional Standards',
  'ประมาณ 30 นาที',
  'required',
  3,
  CURRENT_TIMESTAMP
) ON CONFLICT (id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP;
