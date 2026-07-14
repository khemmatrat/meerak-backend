-- =============================================================================
-- 199: Provider WHT postings and fiscal document source hardening
-- =============================================================================
-- WHT is separate from VAT. This table is append-only by convention and links each
-- provider withholding to one ledger/source event and optional fiscal documents.
-- =============================================================================

CREATE TABLE IF NOT EXISTS tax_withholding_postings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_event_id TEXT NOT NULL,
  source_event_type TEXT NOT NULL,
  source_payment_id TEXT,
  source_job_id TEXT,
  source_booking_id TEXT,
  source_milestone_id TEXT,
  provider_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  gross_income_amount NUMERIC(18,2) NOT NULL CHECK (gross_income_amount >= 0),
  wht_rate_percent NUMERIC(6,2) NOT NULL CHECK (wht_rate_percent >= 0),
  withheld_amount NUMERIC(18,2) NOT NULL CHECK (withheld_amount >= 0),
  net_payable_amount NUMERIC(18,2) NOT NULL CHECK (net_payable_amount >= 0),
  eligibility_status TEXT NOT NULL DEFAULT 'eligible'
    CHECK (eligibility_status IN ('eligible', 'blocked_missing_tax_profile', 'not_eligible')),
  eligibility_reason TEXT,
  tax_profile_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  withholding_agent_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  earning_document_id UUID REFERENCES fiscal_documents(id) ON DELETE SET NULL,
  wht_certificate_document_id UUID REFERENCES fiscal_documents(id) ON DELETE SET NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_event_id, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_tax_wht_provider_created ON tax_withholding_postings (provider_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tax_wht_source ON tax_withholding_postings (source_event_id, source_event_type);
CREATE INDEX IF NOT EXISTS idx_tax_wht_status ON tax_withholding_postings (eligibility_status, created_at DESC);

COMMENT ON TABLE tax_withholding_postings IS 'Provider withholding tax postings. VAT and WHT are separate; this table records WHT 3% (or configured rate) linked to provider earning sources.';

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
        'promo_discount_subsidy'
      ));
  END IF;
END $$;
