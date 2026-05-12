-- =================================================================================
-- 155: Payout reconciliation (Tier A audit traceability)
-- =================================================================================
-- reconciliation_status: PENDING | PASS | WARN | FAIL
-- =================================================================================

ALTER TABLE payout_requests
  ADD COLUMN IF NOT EXISTS reconciliation_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (reconciliation_status IN ('PENDING', 'PASS', 'WARN', 'FAIL'));

ALTER TABLE payout_requests
  ADD COLUMN IF NOT EXISTS reconciliation_details JSONB NOT NULL DEFAULT '{}';

ALTER TABLE payout_requests
  ADD COLUMN IF NOT EXISTS slip_hash TEXT;

ALTER TABLE payout_requests
  ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_payout_requests_reconciliation_status
  ON payout_requests (reconciliation_status);

CREATE INDEX IF NOT EXISTS idx_payout_requests_slip_hash
  ON payout_requests (slip_hash)
  WHERE slip_hash IS NOT NULL;

COMMENT ON COLUMN payout_requests.reconciliation_status IS 'Tier A rules aggregate: PENDING before first run, PASS/WARN/FAIL after runPayoutReconciliation';
COMMENT ON COLUMN payout_requests.reconciliation_details IS 'JSON: { R1..R5: { ok, ... } }';
COMMENT ON COLUMN payout_requests.slip_hash IS 'SHA-256 hex of slip file bytes (evidence integrity)';
COMMENT ON COLUMN payout_requests.reconciled_at IS 'Last reconciliation run timestamp';
