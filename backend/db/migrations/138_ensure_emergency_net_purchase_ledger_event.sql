-- =============================================================================
-- 138: บังคับให้ payment_ledger_audit รองรับ emergency_net_purchase
-- กรณี DB รัน migration 128 แล้วไม่ได้รัน 136 / constraint หลุดจากลำดับรัน
-- รันได้ซ้ำ (idempotent)
-- =============================================================================
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
