-- 106: Member Payout Comparison — Official rates by VIP tier
-- Commission + Sourcing vary by tier. Formula: Payout = JobFee * (1 - totalDeductionRate)
-- Normal: 32% (24% Comm + 8% Source) → 340฿ on 500฿
-- Silver: 28% (20% Comm + 8% Source) → 360฿ on 500฿
-- Gold: 24% (18% Comm + 6% Source) → 380฿ on 500฿
-- Platinum: 18% (14% Comm + 4% Source) → 410฿ on 500฿

UPDATE payout_config
SET value_json = COALESCE(value_json, '{}'::jsonb) || '{"commission_match_board":{"none":24,"silver":20,"gold":18,"platinum":14},"sourcing_fee_match_board":{"none":8,"silver":8,"gold":6,"platinum":4}}'::jsonb
WHERE key = 'fee_rates';
