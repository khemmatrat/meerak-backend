-- =============================================================================
-- 147: AQOND Gateway — recon, fraud metadata, audit, webhook outbox, VOIDED, integrity verify
-- =============================================================================

-- Status: add VOIDED (fraud / void without settlement)
ALTER TABLE gateway_transactions DROP CONSTRAINT IF EXISTS gateway_transactions_status_check;
ALTER TABLE gateway_transactions ADD CONSTRAINT gateway_transactions_status_check
  CHECK (status IN (
    'PENDING', 'AUTHORIZED', 'CAPTURED', 'SETTLED', 'REFUNDED', 'FAILED', 'VOIDED'
  ));

ALTER TABLE gateway_transactions ADD COLUMN IF NOT EXISTS job_id TEXT;
ALTER TABLE gateway_transactions ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE gateway_transactions ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE gateway_transactions ADD COLUMN IF NOT EXISTS device_id TEXT;
ALTER TABLE gateway_transactions ADD COLUMN IF NOT EXISTS release_rules JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE gateway_transactions ADD COLUMN IF NOT EXISTS fraud_flags JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE gateway_transactions ADD COLUMN IF NOT EXISTS locked_for_recon BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE gateway_transactions ADD COLUMN IF NOT EXISTS recon_alert_at TIMESTAMPTZ;
ALTER TABLE gateway_transactions ADD COLUMN IF NOT EXISTS auto_alert_sent BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE gateway_transactions ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_gateway_tx_job ON gateway_transactions (job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gateway_tx_device_created ON gateway_transactions (device_id, created_at DESC) WHERE device_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gateway_tx_ip_created ON gateway_transactions (ip_address, created_at DESC) WHERE ip_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gateway_tx_locked ON gateway_transactions (locked_for_recon) WHERE locked_for_recon = TRUE;

COMMENT ON COLUMN gateway_transactions.release_rules IS 'Programmable disbursement: JSON rules (e.g. photo + client confirm + GPS)';
COMMENT ON COLUMN gateway_transactions.fraud_flags IS 'Velocity / fingerprint signals; no PAN';

-- Admin audit (masked resource views)
CREATE TABLE IF NOT EXISTS gateway_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  admin_user_id TEXT NOT NULL,
  admin_email TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  ip_address TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_gateway_audit_created ON gateway_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gateway_audit_admin ON gateway_audit_logs (admin_user_id);

COMMENT ON TABLE gateway_audit_logs IS 'Who accessed gateway admin views (masked data)';

-- Outbound webhooks with retry (exponential backoff processed in app)
CREATE TABLE IF NOT EXISTS gateway_webhook_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_type TEXT NOT NULL,
  target_url TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  idempotency_key TEXT,
  attempt_count INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'delivered', 'abandoned')),
  last_error TEXT,
  last_http_status INT,
  correlation_id TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gateway_webhook_outbox_idem
  ON gateway_webhook_outbox (idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gateway_webhook_pending ON gateway_webhook_outbox (next_attempt_at)
  WHERE status = 'pending';

COMMENT ON TABLE gateway_webhook_outbox IS 'Reliable delivery to main AQOND webhooks; app applies backoff';

-- Nightly reconciliation runs
CREATE TABLE IF NOT EXISTS gateway_reconciliation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  timezone TEXT NOT NULL DEFAULT 'Asia/Bangkok',
  matched_count INT NOT NULL DEFAULT 0,
  mismatch_count INT NOT NULL DEFAULT 0,
  locked_count INT NOT NULL DEFAULT 0,
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_gateway_recon_run_at ON gateway_reconciliation_runs (run_at DESC);

-- SQL-native integrity check (must match trigger gateway_ledger_compute_chain_hash)
CREATE OR REPLACE FUNCTION verify_gateway_ledger_integrity()
RETURNS JSONB AS $$
DECLARE
  r RECORD;
  prev_h TEXT := '';
  payload TEXT;
  expected_hash TEXT;
  n INT := 0;
BEGIN
  FOR r IN SELECT * FROM gateway_ledger_entries ORDER BY id ASC LOOP
    n := n + 1;
    IF r.prev_hash IS DISTINCT FROM prev_h THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'prev_hash_mismatch', 'id', r.id);
    END IF;
    payload := prev_h || '|' || COALESCE(r.journal_id::TEXT, '') || '|' ||
      COALESCE(r.gateway_transaction_id::TEXT, '') || '|' ||
      COALESCE(r.account_code, '') || '|' || COALESCE(r.side, '') || '|' ||
      COALESCE(r.amount_minor::TEXT, '0') || '|' || COALESCE(r.currency, '') || '|' ||
      COALESCE(r.description, '') || '|' || COALESCE(r.created_at::TEXT, '');
    expected_hash := encode(sha256(payload::bytea), 'hex');
    IF expected_hash IS DISTINCT FROM r.entry_hash THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'entry_hash_mismatch', 'id', r.id);
    END IF;
    prev_h := r.entry_hash;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'rows_checked', n);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION verify_gateway_ledger_integrity() IS 'Recomputes SHA256 chain; detects unauthorized DB edits';
