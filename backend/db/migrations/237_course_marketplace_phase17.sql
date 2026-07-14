-- 237: Course Marketplace Phase 17 — refund policy, payout lifecycle, ledger hardening

ALTER TABLE course_purchase_orders
  ADD COLUMN IF NOT EXISTS payout_status VARCHAR(30) DEFAULT 'held',
  ADD COLUMN IF NOT EXISTS payout_release_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payout_released_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payout_ledger_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS refund_status VARCHAR(30) DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_ledger_id VARCHAR(100);

CREATE TABLE IF NOT EXISTS course_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES course_purchase_orders(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id VARCHAR(100) NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  instructor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  gross_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  platform_fee NUMERIC(18,2) NOT NULL DEFAULT 0,
  instructor_net NUMERIC(18,2) NOT NULL DEFAULT 0,
  progress_pct NUMERIC(5,2) DEFAULT 0,
  reason_code VARCHAR(60) NOT NULL DEFAULT 'buyer_request',
  reason_note TEXT,
  admin_override BOOLEAN DEFAULT FALSE,
  ledger_id VARCHAR(100),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_refunds_order ON course_refunds(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_course_refunds_user ON course_refunds(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_course_purchase_orders_payout_release
  ON course_purchase_orders(payout_status, payout_release_at)
  WHERE payout_status = 'held' AND refund_status = 'none';

-- Allow repurchase after refund while keeping one active order per user/course
ALTER TABLE course_purchase_orders DROP CONSTRAINT IF EXISTS course_purchase_orders_user_id_course_id_key;
DROP INDEX IF EXISTS idx_course_purchase_orders_active_unique;
CREATE UNIQUE INDEX idx_course_purchase_orders_active_unique
  ON course_purchase_orders(user_id, course_id)
  WHERE status NOT IN ('refunded', 'cancelled');

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
        'course_purchase','course_refund','course_instructor_payout'
      ));
  END IF;
END $$;

INSERT INTO payout_config (key, value_json, updated_at)
VALUES (
  'course_refund_policy',
  '{"guaranteeDays":7,"maxProgressPct":20,"allowAdminOverride":true}'::jsonb,
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  value_json = EXCLUDED.value_json,
  updated_at = NOW();

INSERT INTO payout_config (key, value_json, updated_at)
VALUES (
  'course_payout_policy',
  '{"holdDays":7,"releaseToWithdrawable":true,"blockOnRefund":true}'::jsonb,
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  value_json = EXCLUDED.value_json,
  updated_at = NOW();

INSERT INTO payout_config (key, value_json, updated_at)
VALUES (
  'course_revenue_policy',
  '{"platformRate":0.35,"coachDirectDiscountRate":0.1,"coachDirectPlatformRate":0.25}'::jsonb,
  NOW()
)
ON CONFLICT (key) DO NOTHING;

UPDATE course_purchase_orders
SET
  payout_status = COALESCE(payout_status, 'released'),
  payout_release_at = COALESCE(payout_release_at, created_at),
  payout_released_at = COALESCE(payout_released_at, created_at),
  refund_status = COALESCE(refund_status, 'none')
WHERE status = 'completed';
