-- 226: Scale-ready indexes for per-user financial movement queries (admin User Management)
-- Keyset pagination: WHERE user_id = ? AND event_type IN (...) AND (created_at, id) < (cursor) ORDER BY created_at DESC, id DESC

CREATE INDEX IF NOT EXISTS idx_pla_user_event_created
  ON payment_ledger_audit (user_id, event_type, created_at DESC, id DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pla_user_wallet_deposit_created
  ON payment_ledger_audit (user_id, created_at DESC, id DESC)
  WHERE user_id IS NOT NULL AND event_type = 'wallet_deposit';

CREATE INDEX IF NOT EXISTS idx_pla_user_payout_created
  ON payment_ledger_audit (user_id, created_at DESC, id DESC)
  WHERE user_id IS NOT NULL AND event_type = 'user_payout_withdrawal';

CREATE INDEX IF NOT EXISTS idx_wallet_deposit_charges_user_status_created
  ON wallet_deposit_charges (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payout_requests_user_status_created
  ON payout_requests (user_id, status, created_at DESC);

COMMENT ON INDEX idx_pla_user_event_created IS
  'Admin per-user financial movements — keyset pagination on payment_ledger_audit';
