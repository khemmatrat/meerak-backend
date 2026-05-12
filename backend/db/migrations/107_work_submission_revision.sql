-- 107: Work Submission and Revision Flow
-- Talent submits work → Under Review → Employer Approve & Pay OR Request Revision

ALTER TABLE advance_jobs
  ADD COLUMN IF NOT EXISTS work_submission_status VARCHAR(20) DEFAULT 'none' CHECK (work_submission_status IN ('none', 'submitted', 'revision_requested')),
  ADD COLUMN IF NOT EXISTS work_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS work_submission_url TEXT,
  ADD COLUMN IF NOT EXISTS work_submission_links JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS revision_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revision_limit INT DEFAULT 3,
  ADD COLUMN IF NOT EXISTS revision_notes JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS last_revision_requested_at TIMESTAMPTZ;

COMMENT ON COLUMN advance_jobs.work_submission_status IS 'none | submitted (Under Review) | revision_requested';
COMMENT ON COLUMN advance_jobs.work_submission_url IS 'Primary submission URL from Talent';
COMMENT ON COLUMN advance_jobs.work_submission_links IS 'Array of {url, label} links';
COMMENT ON COLUMN advance_jobs.revision_count IS 'Number of revision requests so far';
COMMENT ON COLUMN advance_jobs.revision_limit IS 'Max revision requests (default 3)';
COMMENT ON COLUMN advance_jobs.revision_notes IS 'Array of {note, requested_at} from employer';
COMMENT ON COLUMN advance_jobs.last_revision_requested_at IS 'For 7-day auto-release if employer no response';
