-- =================================================================================
-- 023: Advance Job — Reviews & Rating (ให้คะแนนนายจ้าง) + employer_trust_score
-- =================================================================================
-- เมื่อ Talent ให้ดาวนายจ้าง ระบบคำนวณค่าเฉลี่ยและอัปเดต users.employer_trust_score
-- =================================================================================

-- คอลัมน์คะแนนความน่าเชื่อถือของนายจ้าง (โชว์ใน Job Board)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS employer_trust_score NUMERIC(3,2) DEFAULT 0 CHECK (employer_trust_score >= 0 AND employer_trust_score <= 5);

COMMENT ON COLUMN users.employer_trust_score IS 'ค่าเฉลี่ย rating จาก advance_job_reviews (1-5) ใช้โชว์ใน Job Board';

-- ตารางรีวิว: Talent รีวิวนายจ้าง หลังงาน completed
CREATE TABLE IF NOT EXISTS advance_job_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES advance_jobs(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(job_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_advance_job_reviews_job ON advance_job_reviews(job_id);
CREATE INDEX IF NOT EXISTS idx_advance_job_reviews_reviewee ON advance_job_reviews(reviewee_id);

COMMENT ON TABLE advance_job_reviews IS 'Talent ให้ดาวนายจ้างหลังงาน Advance Job completed; reviewee = employer';
