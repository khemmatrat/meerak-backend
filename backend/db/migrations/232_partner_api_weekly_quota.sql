-- Tier 4.2: per-key weekly request quota (0 = unlimited)
ALTER TABLE partner_api_keys
  ADD COLUMN IF NOT EXISTS weekly_quota_requests INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN partner_api_keys.weekly_quota_requests IS
  'Max partner API requests per rolling 7 days; 0 = no weekly cap';
