-- =================================================================================
-- 020: Advance Job — การจ้าง (Hired), Escrow, Milestone, แชท
-- =================================================================================

-- คอลัมน์เพิ่มใน advance_jobs: คนที่จ้างแล้ว + Escrow
ALTER TABLE advance_jobs
  ADD COLUMN IF NOT EXISTS hired_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hired_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS agreed_amount NUMERIC(12,2) CHECK (agreed_amount IS NULL OR agreed_amount >= 0),
  ADD COLUMN IF NOT EXISTS escrow_amount NUMERIC(12,2) DEFAULT 0 CHECK (escrow_amount >= 0),
  ADD COLUMN IF NOT EXISTS escrow_status VARCHAR(20) DEFAULT 'none' CHECK (escrow_status IN ('none', 'held', 'released', 'refunded', 'disputed'));

CREATE INDEX IF NOT EXISTS idx_advance_jobs_hired_user ON advance_jobs(hired_user_id) WHERE hired_user_id IS NOT NULL;

COMMENT ON COLUMN advance_jobs.hired_user_id IS 'Talent ที่นายจ้างเลือกจ้าง';
COMMENT ON COLUMN advance_jobs.agreed_amount IS 'จำนวนเงินที่ตกลงกัน (บาท)';
COMMENT ON COLUMN advance_jobs.escrow_amount IS 'จำนวนที่โอนเข้า Escrow แล้ว';
COMMENT ON COLUMN advance_jobs.escrow_status IS 'สถานะเงินใน Escrow';

-- =================================================================================
-- advance_job_milestones: จ่ายเป็นงวด (optional)
-- =================================================================================
CREATE TABLE IF NOT EXISTS advance_job_milestones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES advance_jobs(id) ON DELETE CASCADE,
  "order" INTEGER NOT NULL CHECK ("order" >= 1),
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'released')),
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_advance_job_milestones_job ON advance_job_milestones(job_id);

-- =================================================================================
-- advance_job_messages: แชทระหว่างนายจ้างกับ Talent (หลังจ้างหรือระหว่างคุย)
-- =================================================================================
CREATE TABLE IF NOT EXISTS advance_job_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES advance_jobs(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_advance_job_messages_job ON advance_job_messages(job_id);
CREATE INDEX IF NOT EXISTS idx_advance_job_messages_created ON advance_job_messages(created_at);
