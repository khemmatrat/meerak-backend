-- Intercity charter: driver counter-offers (job fee before platform markup)
-- job_id ต้องชนิดเดียวกับ jobs.id — ใน Postgres schema หลัก jobs.id เป็น UUID
CREATE TABLE IF NOT EXISTS job_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  proposed_job_fee_thb NUMERIC(14, 2) NOT NULL CHECK (proposed_job_fee_thb >= 0),
  proposed_final_price_thb NUMERIC(14, 2),
  status VARCHAR(24) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'superseded', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_bids_job_status ON job_bids (job_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS job_bids_one_pending_per_provider
  ON job_bids (job_id, provider_id)
  WHERE status = 'pending';

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE job_bids TO meera;
