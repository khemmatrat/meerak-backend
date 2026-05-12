-- 099: Scope Agreement — Checklist deliverables ก่อนเริ่มงาน, ทั้งสองฝ่ายกดยืนยัน
-- advance_job_scope_agreements: รายการสิ่งที่ต้องส่งมอบ + employer_confirmed, talent_confirmed
CREATE TABLE IF NOT EXISTS advance_job_scope_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES advance_jobs(id) ON DELETE CASCADE,
  deliverables_json JSONB NOT NULL DEFAULT '[]',  -- [{order, text}, ...]
  employer_confirmed_at TIMESTAMPTZ,
  talent_confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(job_id)
);

CREATE INDEX IF NOT EXISTS idx_scope_agreements_job ON advance_job_scope_agreements(job_id);

COMMENT ON TABLE advance_job_scope_agreements IS 'Scope Agreement: รายการ deliverables — ทั้งสองฝ่ายกดยืนยันก่อนเริ่มงาน';
