-- Outcome-only billing: escrow, click attribution, new ledger events

CREATE TABLE IF NOT EXISTS ad_campaign_escrow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  social_campaign_id TEXT,
  meerak_campaign_ref TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id),
  escrow_micro BIGINT NOT NULL DEFAULT 0,
  spent_micro BIGINT NOT NULL DEFAULT 0,
  outcome_cost_micro BIGINT NOT NULL DEFAULT 50000,
  billing_model VARCHAR(32) NOT NULL DEFAULT 'OUTCOME_ONLY',
  hold_ledger_id TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_campaign_escrow_user ON ad_campaign_escrow(user_id);
CREATE INDEX IF NOT EXISTS idx_ad_campaign_escrow_sc ON ad_campaign_escrow(social_campaign_id);

CREATE TABLE IF NOT EXISTS ad_click_attribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meerak_user_id UUID NOT NULL,
  campaign_id TEXT NOT NULL,
  creative_id TEXT,
  public_impression_id TEXT,
  public_click_id TEXT NOT NULL,
  surface TEXT,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ad_click_attr_user ON ad_click_attribution(meerak_user_id, clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_click_attr_click ON ad_click_attribution(public_click_id);

CREATE TABLE IF NOT EXISTS ad_outcome_billable_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escrow_id UUID REFERENCES ad_campaign_escrow(id),
  campaign_id TEXT NOT NULL,
  conversion_kind VARCHAR(64) NOT NULL,
  outcome_key TEXT NOT NULL UNIQUE,
  public_click_id TEXT,
  public_impression_id TEXT,
  cost_micro BIGINT NOT NULL DEFAULT 50000,
  meerak_user_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_outcome_log_campaign ON ad_outcome_billable_log(campaign_id, created_at DESC);

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
        'course_purchase','course_purchase_bnpl','course_refund','course_instructor_payout',
        'ad_campaign_spend','ad_campaign_refund',
        'ad_campaign_escrow_hold','ad_campaign_escrow_release',
        'ad_render_credit','ad_render_failed_no_bill',
        'ad_impression_billable','ad_video_view_billable',
        'ad_outcome_billable'
      ));
  END IF;
END $$;
