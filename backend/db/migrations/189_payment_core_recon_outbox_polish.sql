-- =============================================================================
-- 189: Recon suggested_action, wallet claim NOT NULL, escrow release guard SQL,
--       outbox 'sending' + dispatch index, admin correlation_id
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Reconciliation view: incident "suggested_action"
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_wallet_balance_reconciliation AS
SELECT
  q.*,
  (ABS(q.balance_delta) > 0.01::numeric) AS balance_variance_flag,
  CASE
    WHEN COALESCE(q.ledger_row_count, 0::bigint) = 0
      AND q.wallet_balance IS DISTINCT FROM 0::numeric
      THEN 'missing_ledger'::text
    WHEN ABS(q.balance_delta) > 0.01::numeric
      AND q.last_payment_id IS NOT NULL
      AND length(trim(q.last_payment_id)) > 0
      THEN 'check_payment'::text
    WHEN ABS(q.balance_delta) > 0.01::numeric
      THEN 'manual_review'::text
    ELSE 'ok'::text
  END AS suggested_action
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
  'Ledger vs wallets.balance. balance_variance_flag: |delta|>0.01. suggested_action: missing_ledger | check_payment | manual_review | ok.';

-- -----------------------------------------------------------------------------
-- 2) payment_wallet_claims: ledger row required (FK already from 188 column REFERENCES)
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='payment_wallet_claims') THEN
    IF NOT EXISTS (
      SELECT 1 FROM payment_wallet_claims WHERE ledger_entry_id IS NULL
    ) THEN
      EXECUTE 'ALTER TABLE payment_wallet_claims ALTER COLUMN ledger_entry_id SET NOT NULL';
    ELSE
      RAISE NOTICE '[189] payment_wallet_claims has NULL ledger_entry_id — skipping SET NOT NULL (fix rows then rerun)';
    END IF;
  END IF;
END $$;

COMMENT ON COLUMN payment_wallet_claims.ledger_entry_id IS
  'NOT NULL safety net: handlers insert ledger first, then claim in the same transaction (prevents orphaned claim rows). FK: REFERENCES ledger_entries (id).';

-- -----------------------------------------------------------------------------
-- 3) Outbound lifecycle: transient ''sending'' (dispatch lock)
-- -----------------------------------------------------------------------------

ALTER TABLE outbound_domain_events DROP CONSTRAINT IF EXISTS outbound_domain_events_status_check;

ALTER TABLE outbound_domain_events
  ADD CONSTRAINT outbound_domain_events_status_check
  CHECK (status IN ('pending', 'sending', 'sent', 'failed'));

DROP INDEX IF EXISTS idx_outbound_domain_events_dispatch;

CREATE INDEX idx_outbound_domain_events_dispatch
  ON outbound_domain_events (status, next_attempt_at ASC, id ASC)
  WHERE status IN ('pending', 'failed');

COMMENT ON COLUMN outbound_domain_events.status IS 'pending→sending→sent | failed (+retry). sending = claimed by dispatcher (SKIP LOCKED).';

-- -----------------------------------------------------------------------------
-- 4) Admin audit correlation (webhook ⇄ worker ⇄ ledger ⇄ manual fix)
-- -----------------------------------------------------------------------------

ALTER TABLE admin_actions_log
  ADD COLUMN IF NOT EXISTS correlation_id TEXT;

CREATE INDEX IF NOT EXISTS idx_admin_actions_log_correlation_created
  ON admin_actions_log (correlation_id, created_at DESC)
  WHERE correlation_id IS NOT NULL;

COMMENT ON COLUMN admin_actions_log.correlation_id IS
  'Prefer payment_id or provider event id to stitch webhook → worker → ledger → admin action without joining only on trace_id.';
