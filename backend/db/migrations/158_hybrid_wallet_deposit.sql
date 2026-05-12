-- 158: Hybrid wallet deposit — manual_deposits, wallet_transactions, payso channel on charges, payso gateway on ledger
-- =============================================================================

-- 1. manual_deposits — โอน + สลิป รอแอดมิน (ไม่เครดิตวอลเล็ตจนกว่าอนุมัติ)
CREATE TABLE IF NOT EXISTS manual_deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
  slip_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'manual_pending_verification'
    CHECK (status IN ('manual_pending_verification', 'approved', 'rejected')),
  rejection_reason TEXT,
  ledger_id TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_manual_deposits_user_id ON manual_deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_manual_deposits_status ON manual_deposits(status);

COMMENT ON TABLE manual_deposits IS 'เติมเงินแบบโอนธนาคาร + สลิป — รอตรวจสอบก่อนเครดิต';

-- 2. wallet_transactions — funding + settlement (อ้างอิง ledger id จาก payment_ledger_audit)
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  funding_source TEXT NOT NULL CHECK (funding_source IN ('MANUAL', 'PAYSO')),
  settlement_status TEXT NOT NULL CHECK (settlement_status IN ('RECEIVED', 'PENDING_SETTLEMENT')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id ON wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_settlement ON wallet_transactions(settlement_status);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_funding ON wallet_transactions(funding_source);

COMMENT ON TABLE wallet_transactions IS 'เชื่อม ledger wallet_deposit กับแหล่งเงินและสถานะ settlement (PaySo รอโอนเข้าบัญชี)';
COMMENT ON COLUMN wallet_transactions.settlement_status IS 'PAYSO: PENDING_SETTLEMENT จนกว่าจะ reconcile; MANUAL: RECEIVED เมื่ออนุมัติ';

-- 3. wallet_deposit_charges — ช่องทางเติมเงิน
ALTER TABLE wallet_deposit_charges ADD COLUMN IF NOT EXISTS deposit_channel TEXT NOT NULL DEFAULT 'legacy';
COMMENT ON COLUMN wallet_deposit_charges.deposit_channel IS 'legacy | payso | omise (deprecated)';

-- 4. payment_ledger_audit — อนุญาต gateway payso
ALTER TABLE payment_ledger_audit DROP CONSTRAINT IF EXISTS payment_ledger_audit_gateway_check;
ALTER TABLE payment_ledger_audit ADD CONSTRAINT payment_ledger_audit_gateway_check
  CHECK (gateway IN (
    'promptpay', 'stripe', 'truemoney', 'wallet', 'bank_transfer', 'admin', 'payso'
  ));
