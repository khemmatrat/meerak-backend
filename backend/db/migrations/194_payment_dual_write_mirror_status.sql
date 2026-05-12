-- =============================================================================
-- 194: Phase 1B dual-write mirror — widen status domains (additive; no DROP tables)
-- =============================================================================
-- Mirrors gateway_transactions.status strings onto payments / payment_attempts
-- without reinterpretation. Legacy enums from migration 193 remain valid.
--
-- Requires: 193_payment_foundation_phase1b.sql applied.
-- =============================================================================

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE payments ADD CONSTRAINT payments_status_check CHECK (
  status IN (
    'created',
    'pending',
    'requires_action',
    'paid',
    'failed',
    'expired',
    'cancelled',
    'PENDING',
    'PROCESSING',
    'AUTHORIZED',
    'CAPTURED',
    'SETTLED',
    'REFUNDED',
    'FAILED',
    'VOIDED',
    'COMPLETED',
    'EXPIRED'
  )
);

ALTER TABLE payment_attempts DROP CONSTRAINT IF EXISTS payment_attempts_status_check;
ALTER TABLE payment_attempts ADD CONSTRAINT payment_attempts_status_check CHECK (
  status IN (
    'pending',
    'processing',
    'requires_action',
    'completed',
    'failed',
    'expired',
    'cancelled',
    'PENDING',
    'PROCESSING',
    'AUTHORIZED',
    'CAPTURED',
    'SETTLED',
    'REFUNDED',
    'FAILED',
    'VOIDED',
    'COMPLETED',
    'EXPIRED'
  )
);

-- One anchored attempt row per gateway transaction (dual-write idempotency)
CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_attempts_gateway_tx_anchor
  ON payment_attempts (gateway_transaction_id)
  WHERE gateway_transaction_id IS NOT NULL;
