-- =============================================================================
-- 190: Outbound dispatcher hardening — dead vs retry, correlation, stuck sweeper
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Correlation (webhook ⇄ payment ⇄ ledger ⇄ outbound) + dead-letter text
-- -----------------------------------------------------------------------------

ALTER TABLE outbound_domain_events ADD COLUMN IF NOT EXISTS dead_letter_reason TEXT;

ALTER TABLE outbound_domain_events ADD COLUMN IF NOT EXISTS webhook_event_id TEXT;

ALTER TABLE outbound_domain_events ADD COLUMN IF NOT EXISTS ledger_entry_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_outbound_domain_events_webhook_event
  ON outbound_domain_events (webhook_event_id)
  WHERE webhook_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_outbound_domain_events_ledger
  ON outbound_domain_events (ledger_entry_id)
  WHERE ledger_entry_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2) Status model: retry_scheduled (retry) vs dead (terminal)
-- -----------------------------------------------------------------------------

-- Legacy exhaustion used failed + huge next_attempt_at.
UPDATE outbound_domain_events
SET
  status = 'dead',
  dead_letter_reason = COALESCE(dead_letter_reason, 'migrated_retry_exhausted')
WHERE status = 'failed'
  AND next_attempt_at > NOW() + INTERVAL '3600 days';

UPDATE outbound_domain_events
SET status = 'retry_scheduled'
WHERE status = 'failed';

ALTER TABLE outbound_domain_events DROP CONSTRAINT IF EXISTS outbound_domain_events_status_check;

ALTER TABLE outbound_domain_events
  ADD CONSTRAINT outbound_domain_events_status_check
  CHECK (status IN ('pending', 'sending', 'sent', 'retry_scheduled', 'dead'));

COMMENT ON COLUMN outbound_domain_events.status IS 'pending|retry_scheduled → sending → sent; dead terminal; sweep requeues stale sending→pending.';
COMMENT ON COLUMN outbound_domain_events.dead_letter_reason IS 'Set when status=dead (retry exhausted or hard failure).';

-- -----------------------------------------------------------------------------
-- 3) Dispatcher index: claim pending + due retries
-- -----------------------------------------------------------------------------

DROP INDEX IF EXISTS idx_outbound_domain_events_dispatch;

CREATE INDEX idx_outbound_domain_events_dispatch
  ON outbound_domain_events (status, next_attempt_at ASC, id ASC)
  WHERE status IN ('pending', 'retry_scheduled');

-- Helps sweeper: stuck rows in sending
CREATE INDEX IF NOT EXISTS idx_outbound_domain_events_sending_updated
  ON outbound_domain_events (updated_at ASC, id ASC)
  WHERE status = 'sending';
