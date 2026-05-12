-- 092: Advance Job — Private Chat ต่อผู้สมัคร + Deal Flow
-- Private Chat: หนึ่งห้องต่อหนึ่งคู่ (Employer + Talent)
-- Deal: Employer ส่งดีล → Talent Accept/Decline

-- 1. advance_job_chat_threads — ห้องแชทส่วนตัวต่อผู้สมัคร
CREATE TABLE IF NOT EXISTS advance_job_chat_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES advance_jobs(id) ON DELETE CASCADE,
  employer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  talent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(job_id, talent_id)
);

CREATE INDEX IF NOT EXISTS idx_advance_chat_threads_job ON advance_job_chat_threads(job_id);
CREATE INDEX IF NOT EXISTS idx_advance_chat_threads_talent ON advance_job_chat_threads(talent_id);

-- 2. เพิ่ม recipient_id ใน advance_job_messages (NULL = broadcast เก่า)
ALTER TABLE advance_job_messages ADD COLUMN IF NOT EXISTS recipient_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE advance_job_messages ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES advance_job_chat_threads(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_advance_job_messages_thread ON advance_job_messages(thread_id) WHERE thread_id IS NOT NULL;

-- 3. advance_job_deals — ดีลที่ Employer ส่งให้ Talent
CREATE TABLE IF NOT EXISTS advance_job_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES advance_jobs(id) ON DELETE CASCADE,
  employer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  talent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_advance_job_deals_job ON advance_job_deals(job_id);
CREATE INDEX IF NOT EXISTS idx_advance_job_deals_talent ON advance_job_deals(talent_id);
CREATE INDEX IF NOT EXISTS idx_advance_job_deals_status ON advance_job_deals(status) WHERE status = 'pending';

COMMENT ON TABLE advance_job_chat_threads IS 'ห้องแชทส่วนตัว Employer-Talent ต่องาน';
COMMENT ON TABLE advance_job_deals IS 'ดีลที่ Employer ส่งให้ Talent รอ Accept/Decline';
