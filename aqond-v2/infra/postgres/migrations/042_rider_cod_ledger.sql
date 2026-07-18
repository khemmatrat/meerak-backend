-- RR2-WS1: Rider COD prerequisite for 043_rider_os_metrics_daily.sql
-- Authoritative source (do not edit schema shape):
--   backend/db/migrations/006_payment_ledger_audit.sql  (payment_ledger_audit base)
--   backend/db/migrations/267_rider_cod_ledger.sql    (COD tables + event_type CHECK)
-- Apply on commerce database before 043.

-- =================================================================================
-- payment_ledger_audit (append-only) — from backend migration 006
-- =================================================================================
CREATE TABLE IF NOT EXISTS payment_ledger_audit (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'payment_created', 'payment_completed', 'payment_failed',
        'payment_expired', 'payment_refunded', 'escrow_held', 'escrow_released', 'escrow_refunded'
    )),
    payment_id TEXT NOT NULL,
    gateway TEXT NOT NULL CHECK (gateway IN ('promptpay', 'stripe', 'truemoney', 'wallet', 'bank_transfer')),
    job_id TEXT NOT NULL,
    amount NUMERIC(18,2) NOT NULL CHECK (amount >= 0),
    currency TEXT NOT NULL DEFAULT 'THB',
    status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'expired', 'refunded')),
    bill_no TEXT NOT NULL,
    transaction_no TEXT NOT NULL,
    payment_no TEXT,
    user_id TEXT,
    provider_id TEXT,
    metadata JSONB DEFAULT '{}',
    request_id TEXT,
    trace_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_ledger_audit_created_at ON payment_ledger_audit(created_at);
CREATE INDEX IF NOT EXISTS idx_ledger_audit_job_id ON payment_ledger_audit(job_id);
CREATE INDEX IF NOT EXISTS idx_ledger_audit_payment_id ON payment_ledger_audit(payment_id);
CREATE INDEX IF NOT EXISTS idx_ledger_audit_gateway ON payment_ledger_audit(gateway);

CREATE OR REPLACE FUNCTION reject_ledger_audit_update_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'payment_ledger_audit is append-only: UPDATE and DELETE are not allowed';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_ledger_audit_no_update ON payment_ledger_audit;
CREATE TRIGGER trigger_ledger_audit_no_update
    BEFORE UPDATE ON payment_ledger_audit
    FOR EACH ROW EXECUTE PROCEDURE reject_ledger_audit_update_delete();

DROP TRIGGER IF EXISTS trigger_ledger_audit_no_delete ON payment_ledger_audit;
CREATE TRIGGER trigger_ledger_audit_no_delete
    BEFORE DELETE ON payment_ledger_audit
    FOR EACH ROW EXECUTE PROCEDURE reject_ledger_audit_update_delete();

COMMENT ON TABLE payment_ledger_audit IS 'Append-only payment ledger for audit and reconciliation. No one can edit or delete records.';

-- =================================================================================
-- 267: RIDER COD — ledger event types + hold/account state (verbatim from backend)
-- =================================================================================

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
        'rider_cod_deposit_hold','rider_cod_deposit_release',
        'rider_cod_collected','rider_cod_deposited',
        'rider_cod_penalty','rider_cod_discrepancy'
      ));
  END IF;
END $$;

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

CREATE UNIQUE INDEX IF NOT EXISTS uq_rider_cod_holds_job ON commerce.rider_cod_holds(job_id);
CREATE INDEX IF NOT EXISTS idx_rider_cod_holds_rider_status ON commerce.rider_cod_holds(rider_id, status);
CREATE INDEX IF NOT EXISTS idx_rider_cod_holds_status_created ON commerce.rider_cod_holds(status, created_at);

COMMENT ON TABLE commerce.rider_cod_accounts IS 'Per-rider COD outstanding + tier cap (provisional caps). Atomic cap guard via conditional UPDATE.';
COMMENT ON TABLE commerce.rider_cod_holds IS 'Per-job COD hold state. Conditional-UPDATE guard (escrow_holds pattern). Money legs live in ledger_entries.';
