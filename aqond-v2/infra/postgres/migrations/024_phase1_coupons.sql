-- Phase 1: storefront promo codes aligned with coupon-svc
INSERT INTO commerce.coupons (code, kind, value_bps, value_micro, region, min_subtotal_micro) VALUES
  ('AQOND50', 'fixed', 0, 5000, '*', 15000),
  ('FOOD10', 'percent', 1000, 0, '*', 8000),
  ('WELCOME', 'fixed', 0, 2000, '*', 10000),
  ('TRUEMONEY', 'fixed', 0, 1500, '*', 5000)
ON CONFLICT (code) DO UPDATE SET
  kind = EXCLUDED.kind,
  value_bps = EXCLUDED.value_bps,
  value_micro = EXCLUDED.value_micro,
  min_subtotal_micro = EXCLUDED.min_subtotal_micro,
  active = TRUE;
