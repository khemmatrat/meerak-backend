-- 108: Talent Trust Score — คะแนนจากนายจ้างเมื่อ Employer ให้ดาว Talent
-- คล้าย employer_trust_score แต่สำหรับผู้รับงาน (Talent)

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS talent_trust_score NUMERIC(3,2) DEFAULT 0 CHECK (talent_trust_score >= 0 AND talent_trust_score <= 5);

COMMENT ON COLUMN users.talent_trust_score IS 'ค่าเฉลี่ย rating จาก advance_job_reviews (1-5) เมื่อ employer ให้ดาว talent';
