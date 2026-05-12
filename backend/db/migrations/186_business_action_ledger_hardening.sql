-- =============================================================================
-- 186: Business Action Layer — ledger invariants, escrow state, domain events
-- =============================================================================
-- Phase 1A hardening:
--   - Partial UNIQUE on ledger_entries.payment_id per business event_type
--     (wallet topup / subscription / escrow hold) — blocks cross-event double apply
--   - payment_escrow_events: HOLD / RELEASED with at-most-one row per state per payment
--   - outbound_domain_events: exactly-once fan-out (UNIQUE event_name, idempotency_key)
--   - v_wallet_balance_reconciliation: ledger-derived net vs wallets.balance (recon Task)
-- Safe to re-run: uses IF NOT EXISTS where applicable.
-- Requires: PostgreSQL 15+ (partial unique + ON CONFLICT ... WHERE).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Ledger: one business line per payment_id (defense in depth vs idempotency_key)
-- -----------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS ux_ledger_wallet_credit_payment
  ON ledger_entries (payment_id)
  WHERE payment_id IS NOT NULL
    AND event_type = 'WALLET_CREDIT';

CREATE UNIQUE INDEX IF NOT EXISTS ux_ledger_subscription_payment_payment
  ON ledger_entries (payment_id)
  WHERE payment_id IS NOT NULL
    AND event_type = 'SUBSCRIPTION_PAYMENT';

CREATE UNIQUE INDEX IF NOT EXISTS ux_ledger_escrow_hold_payment
  ON ledger_entries (payment_id)
  WHERE payment_id IS NOT NULL
    AND event_type = 'ESCROW_HOLD';

COMMENT ON INDEX ux_ledger_wallet_credit_payment IS
  'At most one WALLET_CREDIT ledger row per payment_id (cross-event duplicate protection).';
COMMENT ON INDEX ux_ledger_subscription_payment_payment IS
  'At most one SUBSCRIPTION_PAYMENT ledger row per payment_id (retry / new event_id safe).';
COMMENT ON INDEX ux_ledger_escrow_hold_payment IS
  'At most one ESCROW_HOLD ledger row per payment_id.';

-- -----------------------------------------------------------------------------
-- 2) Escrow state machine (append-style events; terminal RELEASED)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS payment_escrow_events (
  id              BIGSERIAL PRIMARY KEY,
  payment_id      TEXT NOT NULL,
  state           TEXT NOT NULL CHECK (state IN ('HOLD', 'RELEASED')),
  trace_id        TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_escrow_one_hold
  ON payment_escrow_events (payment_id)
  WHERE state = 'HOLD';

CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_escrow_one_released
  ON payment_escrow_events (payment_id)
  WHERE state = 'RELEASED';

CREATE INDEX IF NOT EXISTS idx_payment_escrow_events_payment
  ON payment_escrow_events (payment_id, created_at DESC);

COMMENT ON TABLE payment_escrow_events IS
  'Escrow lifecycle: at most one HOLD and one RELEASED row per payment_id. Flow: HOLD → RELEASED (terminal).';

-- -----------------------------------------------------------------------------
-- 3) Outbound domain events (exactly-once handoff to async processors)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS outbound_domain_events (
  id                 BIGSERIAL PRIMARY KEY,
  event_name         TEXT NOT NULL,
  idempotency_key    TEXT NOT NULL,
  payload            JSONB NOT NULL DEFAULT '{}'::jsonb,
  trace_id           TEXT,
  payment_id         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ux_outbound_domain_events_dedupe UNIQUE (event_name, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_outbound_domain_events_created
  ON outbound_domain_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_outbound_domain_events_payment
  ON outbound_domain_events (payment_id)
  WHERE payment_id IS NOT NULL;

COMMENT ON TABLE outbound_domain_events IS
  'Durable outbox for domain events; UNIQUE(event_name, idempotency_key) guarantees exactly-once enqueue.';

-- -----------------------------------------------------------------------------
-- 4) Balance reconciliation view: wallets.balance vs ledger signed sum (same grain)
-- -----------------------------------------------------------------------------
-- Ledger net = SUM(credit amounts) − SUM(debit amounts) for rows with user_id set.
-- Reconciliation jobs should alert on ABS(balance_delta) > tolerance.
-- Note: legacy rows without user_id/wallet linkage are excluded from the aggregate.

CREATE OR REPLACE VIEW v_wallet_balance_reconciliation AS
SELECT
  w.id                    AS wallet_id,
  w.user_id,
  w.currency,
  w.balance               AS wallet_balance,
  COALESCE(a.ledger_net, 0::numeric) AS ledger_signed_total,
  (w.balance - COALESCE(a.ledger_net, 0::numeric)) AS balance_delta
FROM wallets w
LEFT JOIN (
  SELECT
    le.user_id,
    le.currency,
    SUM(
      CASE
        WHEN le.direction = 'credit' THEN le.amount
        WHEN le.direction = 'debit'  THEN -le.amount
        ELSE 0::numeric
      END
    ) AS ledger_net
  FROM ledger_entries le
  WHERE le.user_id IS NOT NULL
    AND le.currency IS NOT NULL
  GROUP BY le.user_id, le.currency
) a ON a.user_id = w.user_id AND a.currency = w.currency;

COMMENT ON VIEW v_wallet_balance_reconciliation IS
  'Invariant check: wallets.balance should match SUM ledger signed amounts per (user_id, currency). Use in scheduled reconciliation.';
