-- =================================================================================
-- 013: Financial Admin — job_guarantees, financial_expenses, investors, market_cap
-- =================================================================================
-- For GET /api/admin/financial/job-guarantees, commission, expenses, market-cap
-- =================================================================================

-- Job guarantees (เงินประกันงาน)
CREATE TABLE IF NOT EXISTS job_guarantees (
  id VARCHAR(100) PRIMARY KEY,
  job_id VARCHAR(100) NOT NULL,
  job_title VARCHAR(255),
  amount NUMERIC(18,2) NOT NULL CHECK (amount >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'THB',
  status VARCHAR(30) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'released', 'claimed', 'pending_release')),
  employer_id VARCHAR(255) NOT NULL,
  provider_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_at TIMESTAMPTZ,
  due_release_at TIMESTAMPTZ,
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_job_guarantees_job_id ON job_guarantees(job_id);
CREATE INDEX IF NOT EXISTS idx_job_guarantees_status ON job_guarantees(status);
CREATE INDEX IF NOT EXISTS idx_job_guarantees_created_at ON job_guarantees(created_at);

-- Financial expenses (ค่าใช้จ่าย)
CREATE TABLE IF NOT EXISTS financial_expenses (
  id VARCHAR(100) PRIMARY KEY,
  category VARCHAR(100) NOT NULL,
  label VARCHAR(255) NOT NULL,
  amount NUMERIC(18,2) NOT NULL CHECK (amount >= 0),
  budget NUMERIC(18,2),
  cost_type VARCHAR(20) NOT NULL DEFAULT 'variable'
    CHECK (cost_type IN ('fixed', 'variable')),
  currency VARCHAR(3) NOT NULL DEFAULT 'THB',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_financial_expenses_category ON financial_expenses(category);

-- Investors (นักลงทุน)
CREATE TABLE IF NOT EXISTS investors (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  shares INTEGER NOT NULL CHECK (shares >= 0),
  invested_amount NUMERIC(18,2) NOT NULL CHECK (invested_amount >= 0),
  invested_at DATE NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Market cap snapshots (ประวัติ Market Cap)
CREATE TABLE IF NOT EXISTS market_cap_snapshots (
  id SERIAL PRIMARY KEY,
  snapshot_date VARCHAR(20) NOT NULL,
  market_cap NUMERIC(18,2) NOT NULL CHECK (market_cap >= 0),
  total_shares INTEGER NOT NULL CHECK (total_shares > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_market_cap_snapshots_date ON market_cap_snapshots(snapshot_date);

-- Optional: seed default expenses (run once)
INSERT INTO financial_expenses (id, category, label, amount, budget, cost_type, currency, updated_at)
VALUES
  ('exp-1', 'domain_hosting', 'โดเมน & โฮสติ้ง', 2500, 3000, 'fixed', 'THB', NOW()),
  ('exp-2', 'api_gateway', 'API Gateway', 4200, 5000, 'variable', 'THB', NOW()),
  ('exp-3', 'development', 'ค่าจ้างพัฒนาระบบ', 45000, 50000, 'fixed', 'THB', NOW()),
  ('exp-4', 'marketing', 'การตลาด', 12000, 15000, 'variable', 'THB', NOW()),
  ('exp-5', 'incentives', 'ค่าสนับสนุนโค้ด (incentives)', 8000, 5000, 'variable', 'THB', NOW())
ON CONFLICT (id) DO NOTHING;
