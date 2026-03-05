-- =================================================================================
-- 069: Ledger Checksum Chaining (Audit Integrity)
-- =================================================================================
-- Upgrade: hash_checksum ต้องอิงจากแถวก่อนหน้า (Chaining) เพื่อตรวจสอบว่า
-- ไม่มีใครแอบแก้ wallet_balance โดยไม่มีที่มาที่ไปใน Ledger
-- =================================================================================

-- Add prev_hash_checksum column (hash ของแถวก่อนหน้า)
ALTER TABLE payment_ledger_audit ADD COLUMN IF NOT EXISTS prev_hash_checksum TEXT;

-- Drop old per-row hash trigger (from 065)
DROP TRIGGER IF EXISTS trigger_payment_ledger_compute_hash ON payment_ledger_audit;

-- New: Compute chain hash = SHA256(prev_hash || row_content)
CREATE OR REPLACE FUNCTION compute_ledger_chain_hash()
RETURNS TRIGGER AS $$
DECLARE
  prev_hash TEXT := '';
  payload TEXT;
BEGIN
  -- Get hash of previous row (last inserted)
  SELECT hash_checksum INTO prev_hash
  FROM payment_ledger_audit
  WHERE created_at = (SELECT MAX(created_at) FROM payment_ledger_audit)
  ORDER BY id DESC
  LIMIT 1;

  prev_hash := COALESCE(prev_hash, '');
  NEW.prev_hash_checksum := prev_hash;

  payload := prev_hash || '|' || COALESCE(NEW.id::TEXT, '') || '|' ||
    COALESCE(NEW.event_type::TEXT, '') || '|' || COALESCE(NEW.payment_id::TEXT, '') || '|' ||
    COALESCE(NEW.gateway::TEXT, '') || '|' || COALESCE(NEW.job_id::TEXT, '') || '|' ||
    COALESCE(NEW.amount::TEXT, '0') || '|' || COALESCE(NEW.currency::TEXT, '') || '|' ||
    COALESCE(NEW.status::TEXT, '') || '|' || COALESCE(NEW.bill_no::TEXT, '') || '|' ||
    COALESCE(NEW.transaction_no::TEXT, '') || '|' || COALESCE(NEW.user_id::TEXT, '') || '|' ||
    COALESCE(NEW.provider_id::TEXT, '') || '|' || COALESCE(NEW.metadata::TEXT, '{}') || '|' ||
    COALESCE(NEW.created_at::TEXT, '');
  NEW.hash_checksum := encode(sha256(payload::bytea), 'hex');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_payment_ledger_chain_hash
  BEFORE INSERT ON payment_ledger_audit
  FOR EACH ROW EXECUTE PROCEDURE compute_ledger_chain_hash();

COMMENT ON COLUMN payment_ledger_audit.prev_hash_checksum IS 'Hash of previous row for chain integrity';
COMMENT ON COLUMN payment_ledger_audit.hash_checksum IS 'SHA256(prev_hash || row_content) for tamper detection';
