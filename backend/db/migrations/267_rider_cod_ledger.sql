-- =================================================================================
-- 267: RIDER COD (CASH ON DELIVERY) — ledger event types + hold/account state
-- =================================================================================
-- Design (Opus review, provisional — awaiting business sign-off):
--   * Money movements are recorded in ledger_entries (007: double-entry,
--     append-only, idempotency_key + transaction_group_id). No new *_events table.
--   * payment_ledger_audit (006) event_type CHECK is extended with COD events
--     for the audit trail (same pattern as 261 rider_credit_topup).
--   * Deposit hold / outstanding cap uses a MUTABLE state table so we can apply
--     the conditional-UPDATE double-spend guard (escrow_holds pattern:
--     WHERE status='held" / WHERE outstanding + x <= limit).
--   * Reconciliation reuses reconciliation_runs / reconciliation_lines /
--     financial_audit_log (007) — no rider-specific recon table.
-- Prerequisite: 006, 007 (payment_ledger_audit, ledger_entries, recon tables).
-- =================================================================================

-- 1) Extend payment_ledger_audit event_type CHECK with COD events (pattern 261).
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
        'ad_outcome_billable',
        'rider_credit_topup',
        -- COD lifecycle (267)
        'rider_cod_deposit_hold','rider_cod_deposit_release',
        'rider_cod_collected','rider_cod_deposited',
        'rider_cod_penalty','rider_cod_discrepancy'
      ));
  END IF;
END $$;

-- 2) COD account per rider — the aggregate used for the atomic tier-cap guard.
--    outstanding_micro = COD reserved/held that has NOT been remitted yet.
--    limit_micro is set from the rider tier (provisional caps in app layer).
CREATE TABLE IF NOT EXISTS commerce.rider_cod_accounts (
  rider_id            TEXT PRIMARY KEY,
  user_id             TEXT,
  outstanding_micro   BIGINT NOT NULL DEFAULT 0 CHECK (outstanding_micro >= 0),
  deposit_held_micro  BIGINT NOT NULL DEFAULT 0 CHECK (deposit_held_micro >= 0),
  limit_micro         BIGINT NOT NULL DEFAULT 200000,
  tier                TEXT,
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','locked','suspended')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3) Per-job COD hold — mutable state for the conditional-UPDATE guard.
--    status: held -> collected -> deposited (happy path);
--            released (cancelled, reservation freed) / forfeited (penalty).
CREATE TABLE IF NOT EXISTS commerce.rider_cod_holds (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id              TEXT NOT NULL,
  user_id               TEXT,
  job_id                TEXT NOT NULL,
  order_id              TEXT,
  amount_micro          BIGINT NOT NULL CHECK (amount_micro >= 0),
  deposit_hold_micro    BIGINT NOT NULL DEFAULT 0 CHECK (deposit_hold_micro >= 0),
  status                TEXT NOT NULL DEFAULT 'held'
                          CHECK (status IN ('held','collected','deposited','released','forfeited')),
  tier_limit_micro      BIGINT,
  transaction_group_id  UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  collected_at          TIMESTAMPTZ,
  deposited_at          TIMESTAMPTZ
);

-- One hold per job (idempotent assignment).
CREATE UNIQUE INDEX IF NOT EXISTS uq_rider_cod_holds_job ON commerce.rider_cod_holds(job_id);
CREATE INDEX IF NOT EXISTS idx_rider_cod_holds_rider_status ON commerce.rider_cod_holds(rider_id, status);
CREATE INDEX IF NOT EXISTS idx_rider_cod_holds_status_created ON commerce.rider_cod_holds(status, created_at);

COMMENT ON TABLE commerce.rider_cod_accounts IS 'Per-rider COD outstanding + tier cap (provisional caps). Atomic cap guard via conditional UPDATE.';
COMMENT ON TABLE commerce.rider_cod_holds IS 'Per-job COD hold state. Conditional-UPDATE guard (escrow_holds pattern). Money legs live in ledger_entries.';
