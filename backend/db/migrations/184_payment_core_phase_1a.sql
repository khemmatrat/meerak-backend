-- =============================================================================
-- 184: Payment Core Phase 1A schema extensions (additive, backward-compatible)
-- =============================================================================
-- Scope:
-- - inbound webhook queue storage
-- - webhook event dedupe + replay timestamps
-- - settlement/manual-review/client-reference/trace/status-version columns
-- - reconciliation action status fields
-- Notes:
-- - no mutation trigger changes on append-only ledger tables
-- - all changes are additive and safe for partial rollout
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Inbound webhook jobs (queue persistence / retry state)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_webhook_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  provider TEXT NOT NULL,
  event_id TEXT,
  event_type TEXT,
  trace_id TEXT,

  headers_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload_sha256 TEXT,

  idempotency_key TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'processed', 'hard_failed', 'dead_letter')),
  retryable BOOLEAN NOT NULL DEFAULT TRUE,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  processed_at TIMESTAMPTZ,
  dead_lettered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_jobs_status_next_attempt
  ON payment_webhook_jobs (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_jobs_created_at
  ON payment_webhook_jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_jobs_provider_event
  ON payment_webhook_jobs (provider, event_id)
  WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_webhook_jobs_trace_id
  ON payment_webhook_jobs (trace_id)
  WHERE trace_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_webhook_jobs_idempotency_key
  ON payment_webhook_jobs (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2) Webhook event dedupe + replay guard timestamps
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_webhook_event_dedupe (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  occurred_at TIMESTAMPTZ,
  replay_count INTEGER NOT NULL DEFAULT 0 CHECK (replay_count >= 0),
  last_replay_at TIMESTAMPTZ,
  last_trace_id TEXT,
  PRIMARY KEY (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_event_dedupe_last_seen
  ON payment_webhook_event_dedupe (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_event_dedupe_last_replay
  ON payment_webhook_event_dedupe (last_replay_at DESC)
  WHERE last_replay_at IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3) Extend gateway_transactions with Phase 1A state/correlation fields
-- -----------------------------------------------------------------------------
ALTER TABLE gateway_transactions
  ADD COLUMN IF NOT EXISTS settlement_status VARCHAR(32) NOT NULL DEFAULT 'NOT_APPLICABLE',
  ADD COLUMN IF NOT EXISTS requires_manual_review BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS manual_review_status VARCHAR(32) NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN IF NOT EXISTS manual_review_reason TEXT,
  ADD COLUMN IF NOT EXISTS manual_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS manual_reviewed_by TEXT,
  ADD COLUMN IF NOT EXISTS client_reference_id TEXT,
  ADD COLUMN IF NOT EXISTS trace_id TEXT,
  ADD COLUMN IF NOT EXISTS status_version BIGINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS webhook_replay_last_seen_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'gateway_transactions_settlement_status_check'
  ) THEN
    ALTER TABLE gateway_transactions
      ADD CONSTRAINT gateway_transactions_settlement_status_check
      CHECK (
        settlement_status IN (
          'NOT_APPLICABLE',
          'PAYMENT_CONFIRMED',
          'ESCROW_HELD',
          'ESCROW_RELEASED',
          'ESCROW_REFUNDED',
          'ESCROW_DISPUTED'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'gateway_transactions_manual_review_status_check'
  ) THEN
    ALTER TABLE gateway_transactions
      ADD CONSTRAINT gateway_transactions_manual_review_status_check
      CHECK (
        manual_review_status IN (
          'NOT_REQUIRED',
          'REQUIRES_REVIEW',
          'IN_REVIEW',
          'RESOLVED'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'gateway_transactions_status_version_check'
  ) THEN
    ALTER TABLE gateway_transactions
      ADD CONSTRAINT gateway_transactions_status_version_check
      CHECK (status_version >= 1);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_gateway_tx_settlement_status
  ON gateway_transactions (settlement_status);
CREATE INDEX IF NOT EXISTS idx_gateway_tx_requires_manual_review
  ON gateway_transactions (requires_manual_review)
  WHERE requires_manual_review = TRUE;
CREATE INDEX IF NOT EXISTS idx_gateway_tx_manual_review_status
  ON gateway_transactions (manual_review_status);
CREATE INDEX IF NOT EXISTS idx_gateway_tx_client_reference
  ON gateway_transactions (client_reference_id)
  WHERE client_reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gateway_tx_trace_id
  ON gateway_transactions (trace_id)
  WHERE trace_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_gateway_tx_client_reference
  ON gateway_transactions (client_reference_id)
  WHERE client_reference_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 4) Correlation columns on existing financial/audit tables (additive only)
-- -----------------------------------------------------------------------------
ALTER TABLE ledger_entries
  ADD COLUMN IF NOT EXISTS trace_id TEXT;
CREATE INDEX IF NOT EXISTS idx_ledger_entries_trace_id
  ON ledger_entries (trace_id)
  WHERE trace_id IS NOT NULL;

ALTER TABLE financial_audit_log
  ADD COLUMN IF NOT EXISTS trace_id TEXT;
CREATE INDEX IF NOT EXISTS idx_financial_audit_log_trace_id
  ON financial_audit_log (trace_id)
  WHERE trace_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 5) Reconciliation action status fields
-- -----------------------------------------------------------------------------
ALTER TABLE reconciliation_runs
  ADD COLUMN IF NOT EXISTS action_status VARCHAR(32) NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN IF NOT EXISTS action_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS action_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS trace_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reconciliation_runs_action_status_check'
  ) THEN
    ALTER TABLE reconciliation_runs
      ADD CONSTRAINT reconciliation_runs_action_status_check
      CHECK (
        action_status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'FAILED')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_action_status
  ON reconciliation_runs (action_status);
CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_trace_id
  ON reconciliation_runs (trace_id)
  WHERE trace_id IS NOT NULL;

ALTER TABLE reconciliation_lines
  ADD COLUMN IF NOT EXISTS action_type TEXT,
  ADD COLUMN IF NOT EXISTS action_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS action_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS action_attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS action_last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS action_error TEXT,
  ADD COLUMN IF NOT EXISTS trace_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reconciliation_lines_action_status_check'
  ) THEN
    ALTER TABLE reconciliation_lines
      ADD CONSTRAINT reconciliation_lines_action_status_check
      CHECK (
        action_status IN (
          'PENDING',
          'ENQUEUED',
          'IN_PROGRESS',
          'COMPLETED',
          'FAILED',
          'SKIPPED'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reconciliation_lines_action_attempt_count_check'
  ) THEN
    ALTER TABLE reconciliation_lines
      ADD CONSTRAINT reconciliation_lines_action_attempt_count_check
      CHECK (action_attempt_count >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reconciliation_lines_action_status
  ON reconciliation_lines (action_status);
CREATE INDEX IF NOT EXISTS idx_reconciliation_lines_action_type
  ON reconciliation_lines (action_type)
  WHERE action_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reconciliation_lines_trace_id
  ON reconciliation_lines (trace_id)
  WHERE trace_id IS NOT NULL;
