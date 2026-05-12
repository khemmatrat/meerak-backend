-- AQOND Rescue Net — eSIM digital goods (GigaStore integration)
-- user_digital_assets: purchased activation QR payloads
-- payment_ledger_audit: emergency_net_purchase

CREATE TABLE IF NOT EXISTS user_digital_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_sku TEXT NOT NULL,
  product_name TEXT,
  gigastore_order_ref TEXT,
  activation_qr_payload TEXT NOT NULL,
  base_price NUMERIC(18,2) NOT NULL DEFAULT 0,
  markup_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  convenience_fee NUMERIC(18,2) NOT NULL DEFAULT 15,
  total_charged NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'THB',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_digital_assets_user_created
  ON user_digital_assets(user_id, created_at DESC);

COMMENT ON TABLE user_digital_assets IS 'eSIM / digital goods purchased via Rescue Net; QR for offline install';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'payment_ledger_audit'
  ) THEN
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
        'insurance_replacement_payout', 'platform_stability_reserve', 'reroute_replacement_payout',
        'marine_deposit_held', 'marine_deposit_released', 'marine_deposit_refund', 'marine_compensation_captain',
        'emergency_net_purchase'
      ));
  END IF;
END $$;
