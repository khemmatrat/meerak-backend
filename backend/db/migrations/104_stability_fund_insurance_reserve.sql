-- =================================================================================
-- 104: Stability Fund — Insurance Reserve & Claim Capping (40/60 Rule)
-- =================================================================================
-- 1. users: insurance_credit_balance (Virtual Credit when user pays for insurance)
-- 2. payment_ledger_audit: platform_stability_reserve, insurance_replacement_payout event types
-- =================================================================================

-- 1. insurance_credit_balance on users (Virtual Credit — cash stays in company vault)
ALTER TABLE users ADD COLUMN IF NOT EXISTS insurance_credit_balance NUMERIC(12,2) DEFAULT 0;
COMMENT ON COLUMN users.insurance_credit_balance IS 'Virtual credit from insurance premiums paid. 40% eligible for claim payout, 60% reserved for Platform Stability Reserve';

-- 2. Allow platform_stability_reserve and insurance_replacement_payout in payment_ledger_audit
-- (payment_ledger_audit exists from migration 006)
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
    'admin_credit', 'admin_debit',
    'insurance_replacement_payout', 'platform_stability_reserve', 'reroute_replacement_payout'
  ));
