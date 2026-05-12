-- VIP subscription pricing (merge with server defaults) — Admin Financial Control Settings
INSERT INTO payout_config (key, value_json, updated_at) VALUES
  ('vip_tiers', '{"silver":{"priceMonthly":399,"quotaPerMonth":12,"discountPercent":5},"gold":{"priceMonthly":999,"quotaPerMonth":30,"discountPercent":5},"platinum":{"priceMonthly":1999,"quotaPerMonth":-1,"discountPercent":5}}'::jsonb, NOW())
ON CONFLICT (key) DO NOTHING;

COMMENT ON COLUMN payout_config.value_json IS 'JSON: fee_rates, vip_tiers (priceMonthly THB, quota, discount), thresholds, etc.';
