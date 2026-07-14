-- =============================================================================
-- 217: แก้เบี้ย พ.ร.บ. มอเตอร์ไซค์ที่ seed ผิด (350) → 645.21 ตาม FairDee จริง
-- =============================================================================

UPDATE payout_config
SET value_json = jsonb_set(
  value_json,
  '{base_price_by_car_type}',
  COALESCE(value_json->'base_price_by_car_type', '{}'::jsonb)
    || jsonb_build_object(
      'motorcycle',
      CASE
        WHEN COALESCE((value_json->'base_price_by_car_type'->>'motorcycle')::numeric, 0) <= 350
          THEN 645.21
        ELSE (value_json->'base_price_by_car_type'->>'motorcycle')::numeric
      END,
      'sedan',
      CASE
        WHEN COALESCE((value_json->'base_price_by_car_type'->>'sedan')::numeric, 0) < 100
          THEN 645.21
        ELSE (value_json->'base_price_by_car_type'->>'sedan')::numeric
      END,
      'pickup',
      CASE
        WHEN COALESCE((value_json->'base_price_by_car_type'->>'pickup')::numeric, 0) < 100
          THEN 645.21
        ELSE (value_json->'base_price_by_car_type'->>'pickup')::numeric
      END
    ),
  true
),
updated_at = NOW()
WHERE key = 'prb_module';
