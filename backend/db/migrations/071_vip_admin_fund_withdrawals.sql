-- =================================================================================
-- 071: VIP Admin Fund Withdrawals (Re-inject to main revenue)
-- =================================================================================
-- Track reinject/withdrawals from vip_admin_fund (amount > 0 only in vip_admin_fund)
-- available = SUM(vip_admin_fund) - SUM(vip_admin_fund_withdrawals)
-- =================================================================================

CREATE TABLE IF NOT EXISTS vip_admin_fund_withdrawals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  admin_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vip_fund_withdrawals_created ON vip_admin_fund_withdrawals(created_at DESC);
COMMENT ON TABLE vip_admin_fund_withdrawals IS 'Re-inject/withdrawals from VIP Admin Fund to main revenue';
