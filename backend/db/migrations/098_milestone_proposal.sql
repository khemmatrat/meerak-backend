-- 098: Milestone Proposal — Talent เสนอโครงงวด, Employer อนุมัติหรือแก้ไข
-- advance_job_milestone_proposals: Talent เสนอ เช่น 50% ก่อนเริ่ม, 50% เมื่อส่งมอบ
CREATE TABLE IF NOT EXISTS advance_job_milestone_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES advance_jobs(id) ON DELETE CASCADE,
  talent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  proposal_json JSONB NOT NULL,  -- [{order, amount, description}, ...]
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(job_id)
);

CREATE INDEX IF NOT EXISTS idx_milestone_proposals_job ON advance_job_milestone_proposals(job_id);
CREATE INDEX IF NOT EXISTS idx_milestone_proposals_talent ON advance_job_milestone_proposals(talent_id);

COMMENT ON TABLE advance_job_milestone_proposals IS 'Talent เสนอโครงงวด (50% ก่อนเริ่ม, 50% เมื่อส่งมอบ) — Employer อนุมัติหรือแก้ไข';
