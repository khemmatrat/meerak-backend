-- =============================================================================
-- 198: Wallet fiscal document source support
-- =============================================================================
-- Allows current PaySo/Ksher deposit margin source types to reconcile with
-- VAT-ready fiscal document taxable platform-fee lines.
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
    'insurance_premium'
  ));

COMMENT ON CONSTRAINT platform_revenues_source_type_check ON platform_revenues
  IS 'Platform revenue source types used by revenue insights and fiscal document taxable service-fee reconciliation.';
