-- 093: Advance Job — Views, Saved Jobs, Applicant Viewed, Last Active
-- View count: จำนวนคนที่เปิดดูงาน
-- Saved jobs: Talent บันทึกงานไว้ดูภายหลัง
-- Applicant viewed: Employer เปิดดูโปรไฟล์ Talent แล้ว
-- Last active: เวลาที่ user เคลื่อนไหวล่าสุด

-- 1. advance_job_views — นับจำนวน View ต่องาน
CREATE TABLE IF NOT EXISTS advance_job_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES advance_jobs(id) ON DELETE CASCADE,
  viewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  viewed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_advance_job_views_job ON advance_job_views(job_id);
CREATE INDEX IF NOT EXISTS idx_advance_job_views_viewer ON advance_job_views(viewer_id);

-- 2. saved_advance_jobs — Talent บันทึกงาน
CREATE TABLE IF NOT EXISTS saved_advance_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES advance_jobs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_advance_jobs_user ON saved_advance_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_advance_jobs_job ON saved_advance_jobs(job_id);

-- 3. applicant_profile_views — Employer เปิดดูโปรไฟล์ Talent
CREATE TABLE IF NOT EXISTS applicant_profile_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES advance_jobs(id) ON DELETE CASCADE,
  talent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(job_id, talent_id, employer_id)
);

CREATE INDEX IF NOT EXISTS idx_applicant_profile_views_job ON applicant_profile_views(job_id);
CREATE INDEX IF NOT EXISTS idx_applicant_profile_views_talent ON applicant_profile_views(talent_id);

-- 4. users.last_active_at — อัปเดตเมื่อ user เคลื่อนไหว
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

COMMENT ON TABLE advance_job_views IS 'นับ View ต่องาน (Employer ดูสถิติได้)';
COMMENT ON TABLE saved_advance_jobs IS 'Talent บันทึกงานไว้ดูภายหลัง';
COMMENT ON TABLE applicant_profile_views IS 'Employer เปิดดูโปรไฟล์ Talent แล้ว (แสดง Viewed)';
