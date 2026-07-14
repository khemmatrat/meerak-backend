-- 240: Course Marketplace Phase 3 — idempotency, gift metadata, BNPL / credit line

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS wallet_credit_line_limit NUMERIC(18,2) NOT NULL DEFAULT 3000,
  ADD COLUMN IF NOT EXISTS wallet_credit_line_used NUMERIC(18,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN users.wallet_credit_line_limit IS 'BNPL credit line limit for course installments (THB)';
COMMENT ON COLUMN users.wallet_credit_line_used IS 'BNPL credit line currently utilized (THB)';

CREATE TABLE IF NOT EXISTS course_purchase_idempotency (
  idempotency_key VARCHAR(160) PRIMARY KEY,
  buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id VARCHAR(100) NOT NULL,
  request_hash VARCHAR(64) NOT NULL DEFAULT '',
  response_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days')
);

CREATE INDEX IF NOT EXISTS idx_course_purchase_idempotency_buyer
  ON course_purchase_idempotency(buyer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS course_installment_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES course_purchase_orders(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id VARCHAR(100) NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  total_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  down_payment NUMERIC(18,2) NOT NULL DEFAULT 0,
  credit_principal NUMERIC(18,2) NOT NULL DEFAULT 0,
  installment_count INT NOT NULL DEFAULT 3,
  installment_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS course_installment_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES course_installment_plans(id) ON DELETE CASCADE,
  seq INT NOT NULL DEFAULT 1,
  due_at TIMESTAMPTZ NOT NULL,
  amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  ledger_id VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (plan_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_course_installment_plans_buyer
  ON course_installment_plans(buyer_id, status, created_at DESC);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'payment_ledger_audit' AND constraint_name = 'payment_ledger_audit_event_type_check'
  ) THEN
    ALTER TABLE payment_ledger_audit DROP CONSTRAINT payment_ledger_audit_event_type_check;
    ALTER TABLE payment_ledger_audit ADD CONSTRAINT payment_ledger_audit_event_type_check
      CHECK (event_type IN (
        'payment_created','payment_completed','payment_failed','payment_expired','payment_refunded',
        'escrow_held','escrow_released','escrow_refunded',
        'insurance_liability_credit','insurance_withdrawal',
        'booking_refund','booking_fee','talent_booking_payout',
        'vip_subscription','post_job_fee','branding_package_payout',
        'user_payout_withdrawal','wallet_deposit','wallet_tip',
        'coach_training_fee','trainee_net_income','certified_statement_fee',
        'no_show_refund','no_show_fine',
        'referral_bonus','referral_budget_exhausted',
        'withdrawal_fee_income','provider_wht_withheld',
        'admin_credit','admin_debit',
        'insurance_replacement_payout','platform_stability_reserve','reroute_replacement_payout',
        'marine_deposit_held','marine_deposit_released','marine_deposit_refund','marine_compensation_captain',
        'emergency_net_purchase','intercity_cancel',
        'promo_discount_subsidy','prb_payment','prb_promo_credit',
        'course_purchase','course_purchase_bnpl','course_refund','course_instructor_payout'
      ));
  END IF;
END $$;

INSERT INTO payout_config (key, value_json, updated_at)
VALUES (
  'course_revenue_policy',
  COALESCE(
    (SELECT value_json FROM payout_config WHERE key = 'course_revenue_policy' LIMIT 1),
    '{}'::jsonb
  ) || '{"installment":{"enabled":true,"minGrossThb":300,"installmentCount":3,"downPaymentRate":0.34,"defaultCreditLineThb":3000}}'::jsonb,
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  value_json = payout_config.value_json || EXCLUDED.value_json,
  updated_at = NOW();
