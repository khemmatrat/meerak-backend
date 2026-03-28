-- =============================================================================
-- 148: Zero-knowledge audit reason tags + 24h idempotency key cache
-- =============================================================================

ALTER TABLE gateway_audit_logs ADD COLUMN IF NOT EXISTS reason_tag TEXT;

COMMENT ON COLUMN gateway_audit_logs.reason_tag IS 'Business justification for viewing masked gateway data (ISO 27001)';

CREATE TABLE IF NOT EXISTS gateway_idempotency_keys (
  idempotency_key TEXT PRIMARY KEY,
  gateway_transaction_id UUID NOT NULL REFERENCES gateway_transactions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gateway_idem_expires ON gateway_idempotency_keys (expires_at);

COMMENT ON TABLE gateway_idempotency_keys IS 'Maps client Idempotency-Key to transaction for 24h replay (Stripe-style)';
