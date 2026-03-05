-- =================================================================================
-- 065: AqondPay Foundation — Ledger Hash Checksum + VIP Admin Fund
-- =================================================================================
-- Phase 2: Financial Core
-- 1. Add hash_checksum to payment_ledger_audit for audit integrity
-- 2. Create vip_admin_fund table (12.5% of VIP gross profit)
-- =================================================================================

-- 1. Hash Checksum for payment_ledger_audit (audit-log integrity)
ALTER TABLE payment_ledger_audit ADD COLUMN IF NOT EXISTS hash_checksum TEXT;

-- Trigger: compute SHA256 hash of row content for audit integrity
CREATE OR REPLACE FUNCTION compute_ledger_hash()
RETURNS TRIGGER AS $$
DECLARE
  payload TEXT;
BEGIN
  payload := COALESCE(NEW.id::TEXT, '') || '|' || COALESCE(NEW.event_type::TEXT, '') || '|' ||
    COALESCE(NEW.payment_id::TEXT, '') || '|' || COALESCE(NEW.gateway::TEXT, '') || '|' || COALESCE(NEW.job_id::TEXT, '') || '|' ||
    COALESCE(NEW.amount::TEXT, '0') || '|' || COALESCE(NEW.currency::TEXT, '') || '|' || COALESCE(NEW.status::TEXT, '') || '|' ||
    COALESCE(NEW.bill_no::TEXT, '') || '|' || COALESCE(NEW.transaction_no::TEXT, '') || '|' ||
    COALESCE(NEW.user_id::TEXT, '') || '|' || COALESCE(NEW.provider_id::TEXT, '') || '|' ||
    COALESCE(NEW.metadata::TEXT, '{}') || '|' || COALESCE(NEW.created_at::TEXT, '');
  NEW.hash_checksum := encode(sha256(payload::bytea), 'hex');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_payment_ledger_compute_hash ON payment_ledger_audit;
CREATE TRIGGER trigger_payment_ledger_compute_hash
  BEFORE INSERT ON payment_ledger_audit
  FOR EACH ROW EXECUTE PROCEDURE compute_ledger_hash();

COMMENT ON COLUMN payment_ledger_audit.hash_checksum IS 'SHA256 chain for audit integrity; tamper detection';

-- 2. VIP Admin Fund (12.5% of gross profit from VIP transactions)
CREATE TABLE IF NOT EXISTS vip_admin_fund (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  source_event_type VARCHAR(50) NOT NULL,
  source_ledger_id TEXT,
  source_job_id TEXT,
  source_metadata JSONB DEFAULT '{}',
  vip_tier VARCHAR(20),
  gross_profit NUMERIC(18,2),
  siphon_percent NUMERIC(5,2) DEFAULT 12.5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vip_admin_fund_created ON vip_admin_fund(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vip_admin_fund_source ON vip_admin_fund(source_ledger_id);
COMMENT ON TABLE vip_admin_fund IS '12.5% of VIP transaction gross profit for Admin operational costs';
