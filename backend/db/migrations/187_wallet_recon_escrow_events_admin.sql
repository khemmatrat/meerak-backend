-- =============================================================================
-- 187: Recon view debug columns, escrow/outbound lifecycle, subscription TZ docs, admin audit
-- =============================================================================
-- Companion to 186. Safe re-run using IF NOT EXISTS / OR REPLACE patterns.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Reconciliation view (actionable diagnostics + 0.01 tolerance flag)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_wallet_balance_reconciliation AS
SELECT
  *,
  (ABS(balance_delta) > 0.01::numeric) AS balance_variance_flag
FROM (
  SELECT
    w.id AS wallet_id,
    w.user_id,
    w.currency,
    w.balance AS wallet_balance,
    COALESCE(s.ledger_signed_total, 0::numeric) AS ledger_signed_total,
    (w.balance - COALESCE(s.ledger_signed_total, 0::numeric)) AS balance_delta,
    s.ledger_row_count,
    s.last_ledger_at,
    lp.payment_id AS last_payment_id
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
      ) AS ledger_signed_total,
      COUNT(*)::bigint AS ledger_row_count,
      MAX(le.created_at) AS last_ledger_at
    FROM ledger_entries le
    WHERE le.user_id IS NOT NULL
      AND le.currency IS NOT NULL
    GROUP BY le.user_id, le.currency
  ) s ON s.user_id = w.user_id AND s.currency = w.currency
  LEFT JOIN LATERAL (
    SELECT le.payment_id
    FROM ledger_entries le
    WHERE le.user_id = w.user_id
      AND le.currency = w.currency
      AND le.payment_id IS NOT NULL
      AND length(trim(le.payment_id)) > 0
    ORDER BY le.created_at DESC NULLS LAST, le.id DESC
    LIMIT 1
  ) lp ON TRUE
) q;

COMMENT ON VIEW v_wallet_balance_reconciliation IS
  'Ledger vs wallets.balance per (user_id,currency). balance_variance_flag = ABS(balance_delta) > 0.01 THB-equivalent numeric. Uses ledger row_count / last_payment_id / last_ledger_at for triage; session timezone recommendation: UTC.';

-- NOTE: `wallet_transactions` already exists in many deployments (legacy PaySo/manual
-- funding schema). Cross-flow payment dedupe lives in `payment_wallet_claims` (188).

-- -----------------------------------------------------------------------------
-- 3) Outbound event bus lifecycle (dispatcher / retry worker)
-- -----------------------------------------------------------------------------

ALTER TABLE outbound_domain_events
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE outbound_domain_events
  ADD COLUMN IF NOT EXISTS attempt_count INT NOT NULL DEFAULT 0;

ALTER TABLE outbound_domain_events
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE outbound_domain_events
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE outbound_domain_events DROP CONSTRAINT IF EXISTS outbound_domain_events_status_check;
ALTER TABLE outbound_domain_events
  ADD CONSTRAINT outbound_domain_events_status_check
  CHECK (status IN ('pending', 'sent', 'failed'));

CREATE INDEX IF NOT EXISTS idx_outbound_domain_events_dispatch
  ON outbound_domain_events (status, next_attempt_at ASC, id ASC)
  WHERE status IN ('pending', 'failed');

COMMENT ON COLUMN outbound_domain_events.status IS 'pending → sent | failed; retry increments attempt_count.';
COMMENT ON COLUMN outbound_domain_events.next_attempt_at IS 'Backoff target for outbound dispatcher worker.';

-- -----------------------------------------------------------------------------
-- 4) Escrow HOLD metadata convention (job id for release guard in app layer)
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.payment_escrow_events') IS NOT NULL THEN
    EXECUTE 'COMMENT ON COLUMN public.payment_escrow_events.metadata IS ' || quote_literal(
      'JSON: include job_id (same as client_reference at HOLD) so release can verify job completed.'
    );
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 5) Subscription TIMESTAMPTZ note (timezone = UTC recommended on pool/session)
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.user_subscriptions') IS NOT NULL THEN
    EXECUTE 'COMMENT ON TABLE public.user_subscriptions IS ' || quote_literal(
      'Subscriptions: store active_until as TIMESTAMPTZ only. Prefer session timezone UTC (SET TIME ZONE ''UTC'' or pool options) so NOW() aligns across regions.'
    );
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_subscriptions'
        AND column_name = 'active_until'
    ) THEN
      EXECUTE 'COMMENT ON COLUMN public.user_subscriptions.active_until IS ' || quote_literal(
        'TIMESTAMPTZ subscription end; compare using UTC-aligned DB clocks.'
      );
    END IF;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 6) Admin manual actions audit
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS admin_actions_log (
  id              BIGSERIAL PRIMARY KEY,
  action_type     TEXT NOT NULL,
  payment_id      TEXT,
  before_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_snapshot  JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor           TEXT NOT NULL,
  reason          TEXT,
  trace_id        TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_log_payment
  ON admin_actions_log (payment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_actions_log_action_created
  ON admin_actions_log (action_type, created_at DESC);

COMMENT ON TABLE admin_actions_log IS
  'Immutable-style audit trail for privileged manual corrections; correlate with trace_id where present.';
