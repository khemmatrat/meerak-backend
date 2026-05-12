-- =================================================================================
-- 157: Payso PromptPay payout integration (None-UI) — external transaction refs
-- =================================================================================

ALTER TABLE payout_requests
  ADD COLUMN IF NOT EXISTS payso_transaction_id TEXT;

ALTER TABLE payout_requests
  ADD COLUMN IF NOT EXISTS payso_reference_id TEXT;

CREATE INDEX IF NOT EXISTS idx_payout_requests_payso_ref
  ON payout_requests (payso_reference_id)
  WHERE payso_reference_id IS NOT NULL;

COMMENT ON COLUMN payout_requests.payso_transaction_id IS 'Pay Solutions (Payso) transaction id from API/webhook';
COMMENT ON COLUMN payout_requests.payso_reference_id IS 'Unique reference_id sent to Payso (maps to payout_request_id)';
