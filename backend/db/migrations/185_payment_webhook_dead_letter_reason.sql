-- =============================================================================
-- 185: payment_webhook_jobs.dead_letter_reason (Phase 1A hardening)
-- =============================================================================
-- Why:
--   Operations / analytics need a categorical reason field on dead_lettered
--   jobs. last_error already carries the human-readable message; this column
--   carries the *category* (e.g. 'max_retries_exceeded') so dashboards can
--   group/filter without text parsing.
--
-- Notes:
--   - additive only (safe re-run)
--   - partial index keeps the index lean (most jobs have NULL)
--   - no trigger / constraint changes
-- =============================================================================

ALTER TABLE payment_webhook_jobs
  ADD COLUMN IF NOT EXISTS dead_letter_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_payment_webhook_jobs_dead_letter_reason
  ON payment_webhook_jobs (dead_letter_reason)
  WHERE dead_letter_reason IS NOT NULL;
