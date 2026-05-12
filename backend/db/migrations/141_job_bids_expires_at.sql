-- Intercity bids: TTL (default 30 min) + status expired
ALTER TABLE job_bids
  ADD COLUMN IF NOT EXISTS bid_expires_at TIMESTAMPTZ;

UPDATE job_bids
SET bid_expires_at = created_at + INTERVAL '30 minutes'
WHERE bid_expires_at IS NULL AND status = 'pending';

ALTER TABLE job_bids DROP CONSTRAINT IF EXISTS job_bids_status_check;
ALTER TABLE job_bids ADD CONSTRAINT job_bids_status_check
  CHECK (status IN ('pending', 'accepted', 'rejected', 'superseded', 'cancelled', 'expired'));

CREATE INDEX IF NOT EXISTS idx_job_bids_pending_expires
  ON job_bids (job_id, status, bid_expires_at)
  WHERE status = 'pending';
