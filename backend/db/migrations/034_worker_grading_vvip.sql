-- ══════════════════════════════════════════════════════════════════════
-- Migration 034: Worker Grading System & VVIP Job Access
-- ══════════════════════════════════════════════════════════════════════

-- ── 1. Multi-category Job Reviews ──────────────────────────────────────
-- แทนที่ 1-5 ดาวเดิม เพิ่มหมวดหมู่แยก และ smart tags
CREATE TABLE IF NOT EXISTS job_reviews (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id        VARCHAR(100) NOT NULL,
  reviewer_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewee_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- คะแนนรายหมวด (1-5 ทุก dimension)
  rating_overall      DECIMAL(2,1) NOT NULL CHECK (rating_overall BETWEEN 1 AND 5),
  rating_quality      DECIMAL(2,1) CHECK (rating_quality BETWEEN 1 AND 5),
  rating_punctuality  DECIMAL(2,1) CHECK (rating_punctuality BETWEEN 1 AND 5),
  rating_attitude     DECIMAL(2,1) CHECK (rating_attitude BETWEEN 1 AND 5),
  rating_cleanliness  DECIMAL(2,1) CHECK (rating_cleanliness BETWEEN 1 AND 5),
  rating_communication DECIMAL(2,1) CHECK (rating_communication BETWEEN 1 AND 5),

  -- Smart tags ที่ผู้จ้างเลือก
  tags          TEXT[] DEFAULT '{}',
  comment       TEXT,
  is_verified   BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW(),

  UNIQUE(job_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_job_reviews_reviewee ON job_reviews(reviewee_id);
CREATE INDEX IF NOT EXISTS idx_job_reviews_created  ON job_reviews(created_at DESC);

-- ── 2. Worker Grade Cache ───────────────────────────────────────────────
-- เก็บ grade ที่คำนวณแล้ว เพื่อ query เร็วโดยไม่ต้องคำนวณทุกครั้ง
CREATE TABLE IF NOT EXISTS worker_grades (
  user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  grade             CHAR(1) NOT NULL DEFAULT 'C' CHECK (grade IN ('A','B','C')),
  avg_rating        DECIMAL(3,2) DEFAULT 0.00,
  total_reviews     INTEGER DEFAULT 0,
  total_jobs        INTEGER DEFAULT 0,
  success_rate      DECIMAL(5,2) DEFAULT 0.00,  -- % งานที่สำเร็จ
  cert_count        INTEGER DEFAULT 0,           -- จำนวนใบเซอร์ Module2
  is_vvip_eligible  BOOLEAN DEFAULT FALSE,       -- TRUE = Grade A
  last_calculated   TIMESTAMP DEFAULT NOW(),
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_worker_grades_grade ON worker_grades(grade);

-- ── 3. เพิ่ม Column ให้ตาราง jobs / advance_jobs ──────────────────────
-- VVIP flag: เจ้าของงานระดับพรีเมียมสามารถมาร์กงานว่า VVIP
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_vvip   BOOLEAN DEFAULT FALSE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS min_grade CHAR(1) DEFAULT 'C';

-- สำหรับ advance_jobs (ตารางงานระยะยาว)
ALTER TABLE advance_jobs ADD COLUMN IF NOT EXISTS is_vvip   BOOLEAN DEFAULT FALSE;
ALTER TABLE advance_jobs ADD COLUMN IF NOT EXISTS min_grade CHAR(1) DEFAULT 'C';

-- ── 4. เพิ่ม worker_grade column ให้ users ────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS worker_grade CHAR(1) DEFAULT 'C';
ALTER TABLE users ADD COLUMN IF NOT EXISTS grade_updated_at TIMESTAMP;
