-- =============================================================================
-- 213: PRB (Compulsory Motor Insurance) module — FairDee-compatible data capture
-- =============================================================================

CREATE TABLE IF NOT EXISTS aqond_th_addresses (
  id SERIAL PRIMARY KEY,
  parent_id INT REFERENCES aqond_th_addresses(id) ON DELETE CASCADE,
  level VARCHAR(20) NOT NULL CHECK (level IN ('province', 'district', 'subdistrict')),
  name_th VARCHAR(120) NOT NULL,
  postal_code VARCHAR(10),
  sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_aqond_th_addresses_parent ON aqond_th_addresses (parent_id);
CREATE INDEX IF NOT EXISTS idx_aqond_th_addresses_level ON aqond_th_addresses (level);
CREATE UNIQUE INDEX IF NOT EXISTS uq_aqond_th_addresses_parent_name
  ON aqond_th_addresses (COALESCE(parent_id, 0), level, name_th);

CREATE TABLE IF NOT EXISTS aqond_prb_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  quote_number VARCHAR(32),
  fairdee_quote_number VARCHAR(32),
  status VARCHAR(32) NOT NULL DEFAULT 'checking'
    CHECK (status IN ('draft', 'checking', 'processing', 'shipped', 'completed', 'dispute', 'cancelled')),
  policy_status VARCHAR(80),
  payment_status VARCHAR(80) DEFAULT 'ชำระแล้ว',
  insurance_category VARCHAR(20) NOT NULL DEFAULT 'prb',
  car_type VARCHAR(50),
  insurance_class VARCHAR(50),
  registration_year INT,
  registration_number VARCHAR(32),
  registration_province VARCHAR(120),
  chassis_number VARCHAR(64),
  chassis_search_7 VARCHAR(16),
  engine_number VARCHAR(64),
  vehicle_code VARCHAR(16),
  vehicle_brand VARCHAR(80),
  vehicle_model VARCHAR(80),
  vehicle_year INT,
  engine_cc INT,
  vehicle_weight_kg INT,
  seat_count INT,
  accessories_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  coverage_start_date DATE,
  coverage_end_date DATE,
  id_type VARCHAR(40) DEFAULT 'บัตรประชาชน',
  national_id VARCHAR(13),
  name_prefix VARCHAR(20),
  first_name VARCHAR(120),
  last_name VARCHAR(120),
  phone_number VARCHAR(20),
  nationality VARCHAR(60) DEFAULT 'Thailand',
  address_line VARCHAR(15),
  address_province VARCHAR(120),
  address_district VARCHAR(120),
  address_subdistrict VARCHAR(120),
  postal_code VARCHAR(10),
  shipping_address TEXT,
  car_registration_img_url TEXT,
  id_card_img_url TEXT,
  address_proof_img_url TEXT,
  additional_docs_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  policy_pdf_url TEXT,
  provider_code VARCHAR(40),
  provider_name VARCHAR(120),
  base_premium NUMERIC(12,2),
  vat_amount NUMERIC(12,2),
  stamp_duty NUMERIC(12,2),
  total_premium NUMERIC(12,2),
  platform_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_applied NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_price NUMERIC(12,2) NOT NULL,
  ledger_id TEXT,
  fairdee_payload_json JSONB,
  fairdee_bot_status VARCHAR(20) DEFAULT 'pending'
    CHECK (fairdee_bot_status IN ('pending', 'submitted', 'failed', 'done')),
  fairdee_bot_error TEXT,
  admin_notes TEXT,
  dispute_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_aqond_prb_orders_user_created
  ON aqond_prb_orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aqond_prb_orders_status ON aqond_prb_orders (status);
CREATE INDEX IF NOT EXISTS idx_aqond_prb_orders_bot_status ON aqond_prb_orders (fairdee_bot_status);
CREATE INDEX IF NOT EXISTS idx_aqond_prb_orders_dispute
  ON aqond_prb_orders (created_at DESC) WHERE status = 'dispute';

CREATE TABLE IF NOT EXISTS aqond_prb_promo_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  promo_type VARCHAR(40) NOT NULL DEFAULT 'first_order_100',
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMPTZ,
  consumed_order_id UUID REFERENCES aqond_prb_orders(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_aqond_prb_promo_unconsumed
  ON aqond_prb_promo_entitlements (user_id, promo_type)
  WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS aqond_prb_loyalty_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points INT NOT NULL CHECK (points > 0),
  source_order_id UUID REFERENCES aqond_prb_orders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aqond_prb_loyalty_user ON aqond_prb_loyalty_points (user_id, created_at DESC);

COMMENT ON TABLE aqond_prb_orders IS 'PRB orders with full FairDee-compatible fields for admin manual entry or bot automation';
COMMENT ON TABLE aqond_th_addresses IS 'Thailand province/district/subdistrict lookup for PRB address pickers';

-- Seed payout_config prb_module
INSERT INTO payout_config (key, value_json, updated_at)
VALUES (
  'prb_module',
  '{
    "enabled": true,
    "min_wallet_for_entry_thb": 700,
    "first_order_discount_thb": 100,
    "platform_fee_by_car_type": { "sedan": 10, "pickup": 10, "motorcycle": 5 },
    "base_price_by_car_type": { "sedan": 645, "pickup": 645, "motorcycle": 350 },
    "excluded_providers": ["iCare", "ไทยไพบูลย์", "วิริยะ", "Thai Paiboon", "Viriyah"],
    "default_coverage_days": 365,
    "address_line_max_chars": 15,
    "loyalty_points_on_confirm": 10,
    "promo_banner_text": "เติมเงิน 700 บาท รับส่วนลด 100 บาท สำหรับต่อ พ.ร.บ. ครั้งแรก"
  }'::jsonb,
  NOW()
)
ON CONFLICT (key) DO NOTHING;

-- Extend ledger event types
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
        'withdrawal_fee_income', 'provider_wht_withheld',
        'admin_credit', 'admin_debit',
        'insurance_replacement_payout', 'platform_stability_reserve', 'reroute_replacement_payout',
        'marine_deposit_held', 'marine_deposit_released', 'marine_deposit_refund', 'marine_compensation_captain',
        'emergency_net_purchase',
        'intercity_cancel',
        'promo_discount_subsidy',
        'prb_payment',
        'prb_promo_credit'
      ));
  END IF;
END $$;
