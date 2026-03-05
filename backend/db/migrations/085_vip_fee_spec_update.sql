-- =================================================================================
-- 085: VIP Fee Spec Update (Spec ชัย)
-- =================================================================================
-- Client Platform Fee: 8% General, 6% Silver, 5% Gold, 4% Platinum
-- Partner Commission: 24-32% General, 18% Silver, 15% Gold, 12% Platinum (unchanged)
-- =================================================================================

-- อัปเดต platform_fee ใน fee_rates (ถ้ามีอยู่แล้ว)
UPDATE payout_config
SET value_json = jsonb_set(
  COALESCE(value_json, '{}'::jsonb),
  '{platform_fee}',
  '{"none":8,"silver":6,"gold":5,"platinum":4}'::jsonb
)
WHERE key = 'fee_rates';
