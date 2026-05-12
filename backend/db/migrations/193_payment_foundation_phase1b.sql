-- =============================================================================
-- 193: Payment foundation Phase 1B — canonical intent tables (additive only)
-- =============================================================================
-- Goals:
--   - Canonical future SoT for payment intents alongside existing gateway_transactions
--   - No runtime wiring yet; coexistence with legacy rows (nullable FK-friendly)
--   - payment_status_transitions is append-only (no UPDATE/DELETE)
-- Dedupe / ordering: correctness MUST NOT rely on created_at ordering (use status_version +
-- explicit monotonic identifiers only where needed).
--
-- MANUAL ROLLBACK (safe when no FK references from prod code yet):
--   See backend/db/scripts/rollback_193_payment_foundation_phase1b.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) payments — canonical intent
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  purpose TEXT NOT NULL,

  reference_type TEXT,
  reference_id UUID,

  currency CHAR(3) NOT NULL DEFAULT 'THB',
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),

  status TEXT NOT NULL DEFAULT 'created'
    CHECK (
      status IN (
        'created',
        'pending',
        'requires_action',
        'paid',
        'failed',
        'expired',
        'cancelled'
      )
    ),
  status_version BIGINT NOT NULL DEFAULT 1 CHECK (status_version >= 1),

  active_attempt_id UUID,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE payments IS 'Phase 1B canonical payment intent; gateway_transactions remains primary runtime until dual-read flip.';
COMMENT ON COLUMN payments.amount_minor IS 'Amount in smallest currency unit (minor units); aligns with gateway_transactions.amount_minor.';
COMMENT ON COLUMN payments.active_attempt_id IS 'Optional pointer to payment_attempts; FK added after payment_attempts exists.';
COMMENT ON COLUMN payments.reference_type IS 'Logical domain for reference_id (e.g. job, subscription); nullable for legacy coexistence.';

CREATE INDEX IF NOT EXISTS idx_payments_user_created ON payments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_user_status ON payments (user_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_purpose ON payments (purpose);

-- -----------------------------------------------------------------------------
-- 2) payment_attempts — provider / gateway linkage
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,

  provider TEXT NOT NULL,
  method TEXT NOT NULL,

  gateway_transaction_id UUID REFERENCES gateway_transactions(id) ON DELETE SET NULL,
  provider_reference TEXT,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (
      status IN ('pending', 'processing', 'requires_action', 'completed', 'failed', 'expired', 'cancelled')
    ),
  expires_at TIMESTAMPTZ,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE payment_attempts IS 'One row per adapter/provider attempt; gateway_transaction_id nullable until linked.';
COMMENT ON COLUMN payment_attempts.gateway_transaction_id IS 'Nullable for pre-gateway or legacy coexistence.';

CREATE INDEX IF NOT EXISTS idx_payment_attempts_payment ON payment_attempts (payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_gateway_tx
  ON payment_attempts (gateway_transaction_id)
  WHERE gateway_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_attempts_provider_ref
  ON payment_attempts (provider, provider_reference)
  WHERE provider_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_attempts_active
  ON payment_attempts (payment_id, status)
  WHERE status IN ('pending', 'processing', 'requires_action');

-- Deferred FK: payments.active_attempt_id -> payment_attempts (insert order within txn)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_payments_active_attempt'
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT fk_payments_active_attempt
      FOREIGN KEY (active_attempt_id)
      REFERENCES payment_attempts(id)
      ON DELETE SET NULL
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3) payment_status_transitions — append-only audit
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_status_transitions (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,

  from_status TEXT,
  to_status TEXT NOT NULL,

  transition_source TEXT NOT NULL DEFAULT 'system',

  trace_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE payment_status_transitions IS 'Append-only payment intent lifecycle log; triggers block UPDATE/DELETE.';

CREATE INDEX IF NOT EXISTS idx_payment_status_transitions_payment
  ON payment_status_transitions (payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_status_transitions_trace
  ON payment_status_transitions (trace_id)
  WHERE trace_id IS NOT NULL;

CREATE OR REPLACE FUNCTION payment_status_transitions_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'payment_status_transitions is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payment_status_transitions_no_update ON payment_status_transitions;
CREATE TRIGGER trg_payment_status_transitions_no_update
  BEFORE UPDATE ON payment_status_transitions
  FOR EACH ROW EXECUTE PROCEDURE payment_status_transitions_append_only();

DROP TRIGGER IF EXISTS trg_payment_status_transitions_no_delete ON payment_status_transitions;
CREATE TRIGGER trg_payment_status_transitions_no_delete
  BEFORE DELETE ON payment_status_transitions
  FOR EACH ROW EXECUTE PROCEDURE payment_status_transitions_append_only();

-- -----------------------------------------------------------------------------
-- 4) payment_webhook_events — canonical ingress audit
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  provider TEXT NOT NULL,
  external_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT '',

  payload_hash TEXT NOT NULL DEFAULT '',

  trace_id TEXT,
  processed_at TIMESTAMPTZ
);

COMMENT ON TABLE payment_webhook_events IS 'Canonical webhook ingress row; unique (provider, external_event_id) for dedupe. Coexists with payment_webhook_jobs / payment_webhook_event_dedupe.';

CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_webhook_events_provider_external
  ON payment_webhook_events (provider, external_event_id);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_trace
  ON payment_webhook_events (trace_id)
  WHERE trace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_processed
  ON payment_webhook_events (processed_at DESC)
  WHERE processed_at IS NOT NULL;

-- Keep updated_at fresh on payments (optional convenience; no behavior change for legacy)
CREATE OR REPLACE FUNCTION payments_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payments_updated_at ON payments;
CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE PROCEDURE payments_set_updated_at();
