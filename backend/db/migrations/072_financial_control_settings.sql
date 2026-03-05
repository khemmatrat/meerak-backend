-- =================================================================================
-- 072: Financial Control Settings — Fee Rates & Admin Steering
-- =================================================================================
-- Extend payout_config with fee_rates (JobMatch, JobBoard, Booking per VIP tier).
-- Preserves existing keys: withdrawal_min_jobs, withdrawal_min_balance_thb, etc.
-- =================================================================================

-- Fee rates: platform_fee (client) and commission (partner) per VIP tier
-- Tiers: none, silver, gold, platinum
-- platform_fee: Client Platform Fee % (8,8,7,6)
-- commission_match_board: Partner Commission % for Match/Board (24,18,15,12)
-- commission_booking: Partner Commission % for Booking (32,18,15,12)
INSERT INTO payout_config (key, value_json, updated_at) VALUES
  ('fee_rates', '{"platform_fee":{"none":8,"silver":8,"gold":7,"platinum":6},"commission_match_board":{"none":24,"silver":18,"gold":15,"platinum":12},"commission_booking":{"none":32,"silver":18,"gold":15,"platinum":12}}'::jsonb, NOW())
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE payout_config IS 'Payout thresholds (withdrawal_min_*), fees, and fee_rates for Admin Control UI';
