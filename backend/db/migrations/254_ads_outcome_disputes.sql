-- Outcome dispute workflow for admin audit

ALTER TABLE ad_outcome_billable_log
  ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'billed',
  ADD COLUMN IF NOT EXISTS dispute_reason TEXT,
  ADD COLUMN IF NOT EXISTS disputed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_by UUID;

CREATE INDEX IF NOT EXISTS idx_ad_outcome_log_status ON ad_outcome_billable_log(status, created_at DESC);
