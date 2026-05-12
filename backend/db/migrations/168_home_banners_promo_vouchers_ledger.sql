-- =================================================================================
-- 168: Home banners (persisted), user promo vouchers, ledger promo_discount_subsidy
-- =================================================================================

CREATE TABLE IF NOT EXISTS home_banners (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  image_url TEXT NOT NULL,
  action_url TEXT DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  start_date DATE,
  end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  clicks INT NOT NULL DEFAULT 0,
  promo_code TEXT,
  discount_max_baht NUMERIC(18,2),
  discount_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_home_banners_active ON home_banners (is_active, sort_order);

CREATE TABLE IF NOT EXISTS user_promo_vouchers (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  banner_id TEXT NOT NULL REFERENCES home_banners (id) ON DELETE RESTRICT,
  promo_code TEXT NOT NULL,
  max_discount_baht NUMERIC(18,2) NOT NULL,
  remaining_baht NUMERIC(18,2) NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  CONSTRAINT user_promo_vouchers_user_promo UNIQUE (user_id, promo_code)
);

CREATE INDEX IF NOT EXISTS idx_user_promo_vouchers_user ON user_promo_vouchers (user_id);

COMMENT ON TABLE home_banners IS 'แบนเนอร์หน้า Home + โค้ดส่วนลด (แทน in-memory bannersStore)';
COMMENT ON TABLE user_promo_vouchers IS 'วอเชอร์ที่ผู้ใช้รับจากแบนเนอร์ — หักยอดจาก discount_promo_fund เมื่อใช้';

-- Ledger: ส่วนลดโปรโมชันที่สำรองจากกองทุน (audit คู่กับ system_settings.discount_promo_fund)
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
        'emergency_net_purchase',
        'intercity_cancel',
        'promo_discount_subsidy'
      ));
  END IF;
END $$;
