-- =================================================================================
-- 084: User Management Security & Financial Command Tools
-- =================================================================================
-- 1. user_login_sessions — IP + User-Agent per login (for Device Hopping detection)
-- 2. admin_notes — CRM notes on user profiles
-- 3. audit_log — add user_agent column
-- 4. payment_ledger_audit — add admin_credit, admin_debit event types
-- 5. admin_impersonation_tokens — for Login as User (shadow mode)
-- =================================================================================

-- 1. user_login_sessions — track IP + User-Agent per successful login
CREATE TABLE IF NOT EXISTS user_login_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_login_sessions_user ON user_login_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_login_sessions_created ON user_login_sessions(user_id, created_at DESC);

COMMENT ON TABLE user_login_sessions IS 'Last N logins per user: IP + User-Agent for Device Hopping detection';

-- 2. admin_notes — private CRM notes on user profiles
CREATE TABLE IF NOT EXISTS admin_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  admin_id TEXT NOT NULL,
  admin_name TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_notes_user ON admin_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_notes_created ON admin_notes(user_id, created_at DESC);

COMMENT ON TABLE admin_notes IS 'Private CRM notes by Admins on user profiles';

-- 3. audit_log — add user_agent for security tracking
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- 4. payment_ledger_audit — allow admin_credit, admin_debit
ALTER TABLE payment_ledger_audit DROP CONSTRAINT IF EXISTS payment_ledger_audit_event_type_check;
ALTER TABLE payment_ledger_audit ADD CONSTRAINT payment_ledger_audit_event_type_check
  CHECK (event_type IN (
    'payment_created', 'payment_completed', 'payment_failed',
    'payment_expired', 'payment_refunded', 'escrow_held', 'escrow_released', 'escrow_refunded',
    'insurance_liability_credit', 'insurance_withdrawal',
    'booking_refund', 'booking_fee', 'talent_booking_payout',
    'vip_subscription', 'post_job_fee', 'branding_package_payout',
    'user_payout_withdrawal', 'wallet_deposit', 'wallet_tip',
    'coach_training_fee', 'trainee_net_income', 'certified_statement_fee',
    'no_show_refund', 'no_show_fine',
    'referral_bonus', 'referral_budget_exhausted',
    'withdrawal_fee_income',
    'admin_credit', 'admin_debit'
  ));

-- 5. admin_impersonation_tokens — short-lived tokens for Login as User
CREATE TABLE IF NOT EXISTS admin_impersonation_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id TEXT NOT NULL,
  target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_admin_impersonation_tokens_hash ON admin_impersonation_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_admin_impersonation_tokens_expires ON admin_impersonation_tokens(expires_at) WHERE used_at IS NULL;

COMMENT ON TABLE admin_impersonation_tokens IS 'Short-lived impersonation tokens for Admin Ghost (Login as User)';

-- 6. payment_ledger_audit — allow gateway 'admin' for admin_credit/admin_debit
ALTER TABLE payment_ledger_audit DROP CONSTRAINT IF EXISTS payment_ledger_audit_gateway_check;
ALTER TABLE payment_ledger_audit ADD CONSTRAINT payment_ledger_audit_gateway_check
  CHECK (gateway IN ('promptpay', 'stripe', 'truemoney', 'wallet', 'bank_transfer', 'admin'));
