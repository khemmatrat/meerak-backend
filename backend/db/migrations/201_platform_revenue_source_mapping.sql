-- =============================================================================
-- 201: Platform revenue source mapping for tax reconciliation
-- =============================================================================
-- This is additive and does not backfill or mutate historical ledger rows.
-- payment_ledger_audit commission/fee rows remain the canonical reconciliation
-- source; platform_revenues is a supplementary table for runtime revenue insight.
-- Principal/top-up/escrow gross amounts are not AQOND taxable platform revenue.
-- =============================================================================

ALTER TABLE platform_revenues DROP CONSTRAINT IF EXISTS platform_revenues_source_type_check;

ALTER TABLE platform_revenues ADD CONSTRAINT platform_revenues_source_type_check
  CHECK (source_type IN (
    'withdrawal_fee_margin',
    'deposit_margin_promptpay',
    'deposit_margin_truemoney',
    'deposit_margin_card',
    'deposit_margin_payso',
    'deposit_margin_ksher',
    'insurance_premium',
    'match_job_commission',
    'booking_fee',
    'advance_job_commission',
    'wallet_deposit_margin',
    'other_platform_fee'
  ));

COMMENT ON CONSTRAINT platform_revenues_source_type_check ON platform_revenues
  IS 'Allowed source types for supplementary platform_revenues rows. Tax reconciliation treats payment_ledger_audit commission/fee rows as canonical and excludes principal/top-up/escrow gross.';
