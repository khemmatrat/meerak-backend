-- Migration 031: Wallet Balance Constraints
-- เพิ่ม CHECK constraint เพื่อป้องกัน wallet_balance ติดลบ (Defense in Depth)
-- Idempotent: DROP IF EXISTS ก่อน ADD

-- 1. เพิ่ม CHECK constraint สำหรับ wallet_balance (ต้อง >= 0)
ALTER TABLE users DROP CONSTRAINT IF EXISTS check_wallet_balance_non_negative;
ALTER TABLE users ADD CONSTRAINT check_wallet_balance_non_negative CHECK (wallet_balance >= 0);

-- 2. เพิ่ม CHECK constraint สำหรับ wallet_pending (ต้อง >= 0)
ALTER TABLE users DROP CONSTRAINT IF EXISTS check_wallet_pending_non_negative;
ALTER TABLE users ADD CONSTRAINT check_wallet_pending_non_negative CHECK (COALESCE(wallet_pending, 0) >= 0);

-- 3. เพิ่ม Index สำหรับ Query ที่ใช้บ่อย (Performance Optimization)
CREATE INDEX IF NOT EXISTS idx_users_wallet_balance ON users(wallet_balance) WHERE wallet_balance > 0;
CREATE INDEX IF NOT EXISTS idx_payment_ledger_user_id ON payment_ledger_audit(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_ledger_provider_id ON payment_ledger_audit(provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payout_requests_status ON payout_requests(status, created_at DESC);

-- 4. สร้าง Function สำหรับ Audit Log เมื่อมี Negative Balance Attempt
CREATE OR REPLACE FUNCTION log_negative_balance_attempt() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.wallet_balance < 0 THEN
    RAISE EXCEPTION 'Negative wallet balance not allowed: User % attempted balance %', NEW.id, NEW.wallet_balance;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. สร้าง Trigger เพื่อ Enforce Constraint
DROP TRIGGER IF EXISTS prevent_negative_wallet_balance ON users;
CREATE TRIGGER prevent_negative_wallet_balance
  BEFORE UPDATE OF wallet_balance ON users
  FOR EACH ROW
  EXECUTE FUNCTION log_negative_balance_attempt();

COMMENT ON CONSTRAINT check_wallet_balance_non_negative ON users IS 'Prevent negative wallet balance - Production Safety';
COMMENT ON CONSTRAINT check_wallet_pending_non_negative ON users IS 'Prevent negative pending balance - Production Safety';
