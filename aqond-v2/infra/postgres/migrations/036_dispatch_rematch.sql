-- Tier 2: auto-match accept timeout + re-assign
ALTER TABLE commerce.dispatch_jobs
  ADD COLUMN IF NOT EXISTS auto_assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS match_attempts INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_dispatch_jobs_rematch
  ON commerce.dispatch_jobs (status, phase, auto_assigned_at)
  WHERE phase = 'pending_accept';
