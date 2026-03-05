-- =================================================================================
-- 039: Financial Strategy — รองรับหลาย region (TH, ID, VN, MY, LA) สำหรับขยายเอเชีย
-- =================================================================================
-- For GET /api/admin/financial/strategy?region=TH
-- =================================================================================

CREATE TABLE IF NOT EXISTS financial_strategy (
  region VARCHAR(5) PRIMARY KEY CHECK (region IN ('TH', 'ID', 'VN', 'MY', 'LA')),
  currency VARCHAR(3) NOT NULL DEFAULT 'THB',
  total_reserves NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (total_reserves >= 0),
  monthly_burn_rate NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (monthly_burn_rate >= 0),
  expansion_budget NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (expansion_budget >= 0),
  allocation JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE financial_strategy IS 'Financial strategy per region for Asia expansion (TH, ID, VN, MY, LA)';
COMMENT ON COLUMN financial_strategy.allocation IS 'Array of {category, percentage, amount, description}';

-- Default allocation structure
-- allocation: [{category, percentage, amount, description}, ...]

INSERT INTO financial_strategy (region, currency, total_reserves, monthly_burn_rate, expansion_budget, allocation, updated_at)
VALUES
  ('TH', 'THB', 15000000, 1200000, 5000000,
   '[{"category":"R&D / Product","percentage":30,"amount":4500000,"description":"New features and AI development"},{"category":"Marketing","percentage":25,"amount":3750000,"description":"User acquisition ads"},{"category":"Operations","percentage":20,"amount":3000000,"description":"Server costs and staff"},{"category":"Legal & Compliance","percentage":10,"amount":1500000,"description":"Licenses and audit fees"},{"category":"Emergency Reserve","percentage":15,"amount":2250000,"description":"Rainy day fund"}]'::jsonb,
   NOW()),
  ('ID', 'IDR', 0, 0, 0,
   '[{"category":"R&D / Product","percentage":30,"amount":0,"description":"New features and AI development"},{"category":"Marketing","percentage":25,"amount":0,"description":"User acquisition ads"},{"category":"Operations","percentage":20,"amount":0,"description":"Server costs and staff"},{"category":"Legal & Compliance","percentage":10,"amount":0,"description":"Licenses and audit fees"},{"category":"Emergency Reserve","percentage":15,"amount":0,"description":"Rainy day fund"}]'::jsonb,
   NOW()),
  ('VN', 'VND', 0, 0, 0,
   '[{"category":"R&D / Product","percentage":30,"amount":0,"description":"New features and AI development"},{"category":"Marketing","percentage":25,"amount":0,"description":"User acquisition ads"},{"category":"Operations","percentage":20,"amount":0,"description":"Server costs and staff"},{"category":"Legal & Compliance","percentage":10,"amount":0,"description":"Licenses and audit fees"},{"category":"Emergency Reserve","percentage":15,"amount":0,"description":"Rainy day fund"}]'::jsonb,
   NOW()),
  ('MY', 'MYR', 0, 0, 0,
   '[{"category":"R&D / Product","percentage":30,"amount":0,"description":"New features and AI development"},{"category":"Marketing","percentage":25,"amount":0,"description":"User acquisition ads"},{"category":"Operations","percentage":20,"amount":0,"description":"Server costs and staff"},{"category":"Legal & Compliance","percentage":10,"amount":0,"description":"Licenses and audit fees"},{"category":"Emergency Reserve","percentage":15,"amount":0,"description":"Rainy day fund"}]'::jsonb,
   NOW()),
  ('LA', 'LAK', 0, 0, 0,
   '[{"category":"R&D / Product","percentage":30,"amount":0,"description":"New features and AI development"},{"category":"Marketing","percentage":25,"amount":0,"description":"User acquisition ads"},{"category":"Operations","percentage":20,"amount":0,"description":"Server costs and staff"},{"category":"Legal & Compliance","percentage":10,"amount":0,"description":"Licenses and audit fees"},{"category":"Emergency Reserve","percentage":15,"amount":0,"description":"Rainy day fund"}]'::jsonb,
   NOW())
ON CONFLICT (region) DO NOTHING;
