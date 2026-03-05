-- =================================================================================
-- 019: Job Advance (ระบบจ้างงานแบบ Advance — Fastwork-style)
-- =================================================================================
-- ตาราง advance_jobs: งานโพสต์แบบ Advance (รายละเอียด, ขอบเขต, งบประมาณ)
-- ตาราง advance_job_applicants: ผู้สนใจ/ส่งข้อเสนอ (ใช้นับ applicant_count)
-- =================================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Status ตาม Workflow แบบ Fastwork
-- draft → open → pending → in_progress → completed | disputed
CREATE TYPE advance_job_status AS ENUM (
  'draft',
  'open',
  'pending',
  'in_progress',
  'completed',
  'disputed'
);

CREATE TABLE IF NOT EXISTS advance_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- ผู้จ้าง (ผูกกับ users เพื่อดึง employer_trust_score แบบ real-time)
  employer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- รายละเอียดงาน
  title VARCHAR(500) NOT NULL,
  description TEXT NOT NULL,
  scope TEXT NOT NULL,
  category VARCHAR(100) NOT NULL,

  -- งบประมาณ (ใช้คำนวณ Aura พรีเมียม + Filter)
  min_budget NUMERIC(12,2) NOT NULL CHECK (min_budget >= 0),
  max_budget NUMERIC(12,2) NOT NULL CHECK (max_budget >= min_budget),
  duration_days INTEGER NOT NULL CHECK (duration_days > 0),

  -- Status & Priority
  status advance_job_status NOT NULL DEFAULT 'open',
  is_platinum_priority BOOLEAN NOT NULL DEFAULT FALSE,

  -- จำนวนคนสนใจ (denormalized สำหรับแสดงใน Board)
  applicant_count INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ
);

COMMENT ON TABLE advance_jobs IS 'งานแบบ Advance (Job Board): รายละเอียด, ขอบเขต, งบ min-max, duration';
COMMENT ON COLUMN advance_jobs.applicant_count IS 'จำนวนคนที่กดสนใจ/ส่งข้อเสนอ (อัปเดตจาก advance_job_applicants)';
COMMENT ON COLUMN advance_jobs.is_platinum_priority IS 'เฉพาะ Platinum Tier ถึงจะตั้งได้; Backend ต้องเช็กก่อนบันทึก';

-- Indexes: Search & Filter ที่รวดเร็ว
CREATE INDEX IF NOT EXISTS idx_advance_jobs_status ON advance_jobs(status);
CREATE INDEX IF NOT EXISTS idx_advance_jobs_category ON advance_jobs(category);
CREATE INDEX IF NOT EXISTS idx_advance_jobs_employer_id ON advance_jobs(employer_id);
CREATE INDEX IF NOT EXISTS idx_advance_jobs_created_at ON advance_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_advance_jobs_budget ON advance_jobs(min_budget, max_budget) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_advance_jobs_applicant_count ON advance_jobs(applicant_count DESC);

-- =================================================================================
-- advance_job_applicants: เก็บว่ามีใครสนใจ/ส่งข้อเสนอแล้ว (นับเป็น applicant_count)
-- =================================================================================
CREATE TABLE IF NOT EXISTS advance_job_applicants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES advance_jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  status VARCHAR(20) NOT NULL DEFAULT 'interested' CHECK (status IN ('interested', 'shortlisted', 'hired', 'rejected')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(job_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_advance_job_applicants_job_id ON advance_job_applicants(job_id);
CREATE INDEX IF NOT EXISTS idx_advance_job_applicants_user_id ON advance_job_applicants(user_id);

COMMENT ON TABLE advance_job_applicants IS 'ผู้สนใจ/ส่งข้อเสนอรับงาน Advance; ใช้ trigger หรือ app logic อัปเดต advance_jobs.applicant_count';

-- Optional: Trigger อัปเดต applicant_count เมื่อมี insert/delete ใน applicants
-- (หรืออัปเดตใน application layer ตอน INSERT/DELETE advance_job_applicants)
-- CREATE OR REPLACE FUNCTION update_advance_job_applicant_count()
-- RETURNS TRIGGER AS $$
-- BEGIN
--   IF TG_OP = 'INSERT' THEN
--     UPDATE advance_jobs SET applicant_count = applicant_count + 1, updated_at = NOW() WHERE id = NEW.job_id;
--   ELSIF TG_OP = 'DELETE' THEN
--     UPDATE advance_jobs SET applicant_count = GREATEST(0, applicant_count - 1), updated_at = NOW() WHERE id = OLD.job_id;
--   END IF;
--   RETURN NULL;
-- END; $$ LANGUAGE plpgsql;
-- CREATE TRIGGER tr_advance_job_applicant_count
--   AFTER INSERT OR DELETE ON advance_job_applicants FOR EACH ROW EXECUTE PROCEDURE update_advance_job_applicant_count();
