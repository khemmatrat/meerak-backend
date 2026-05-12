-- =================================================================================
-- 103: Add start_date, end_date to jobs (required by conflictValidator)
-- Some schemas (e.g. schema_simple) use datetime only; conflict check needs start/end
-- =================================================================================

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS start_date TIMESTAMP;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS end_date TIMESTAMP;

-- Backfill from datetime/posted_at/created_at when start_date is NULL
UPDATE jobs
SET start_date = COALESCE(start_date, datetime, posted_at, created_at)
WHERE start_date IS NULL AND (datetime IS NOT NULL OR posted_at IS NOT NULL OR created_at IS NOT NULL);

-- Backfill end_date from deadline or start_date + duration
UPDATE jobs
SET end_date = COALESCE(end_date, deadline,
  (COALESCE(start_date, datetime, posted_at, created_at)) + COALESCE(duration_hours, 4) * INTERVAL '1 hour'
)
WHERE end_date IS NULL AND (deadline IS NOT NULL OR datetime IS NOT NULL OR posted_at IS NOT NULL OR created_at IS NOT NULL);
