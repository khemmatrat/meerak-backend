-- =================================================================================
-- 173: Promo banner rules — % discount, min cumulative top-up, first paid job only
-- =================================================================================

ALTER TABLE home_banners
  ADD COLUMN IF NOT EXISTS discount_mode VARCHAR(20) NOT NULL DEFAULT 'fixed_baht',
  ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS min_cumulative_topup_thb NUMERIC(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_paid_job_only BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE home_banners DROP CONSTRAINT IF EXISTS home_banners_discount_mode_check;
ALTER TABLE home_banners ADD CONSTRAINT home_banners_discount_mode_check
  CHECK (discount_mode IN ('fixed_baht', 'percent'));

COMMENT ON COLUMN home_banners.discount_mode IS 'fixed_baht = ลดเป็นบาทจาก discount_max_baht; percent = ลด % ของราคางาน จำกัดด้วย discount_max_baht';
COMMENT ON COLUMN home_banners.discount_percent IS 'เช่น 50.00 = 50% — ใช้เมื่อ discount_mode = percent';
COMMENT ON COLUMN home_banners.min_cumulative_topup_thb IS 'ยอดเติมเงินสะสมขั้นต่ำ (จาก ledger wallet_deposit) ก่อนรับโค้ด';
COMMENT ON COLUMN home_banners.first_paid_job_only IS 'ใช้ส่วนลดได้เฉพาะการชำระงานจ้างงานแรกของลูกค้า (ฝั่งผู้จ้าง)';

ALTER TABLE user_promo_vouchers
  ADD COLUMN IF NOT EXISTS discount_mode VARCHAR(20) NOT NULL DEFAULT 'fixed_baht',
  ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS first_paid_job_only BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE user_promo_vouchers DROP CONSTRAINT IF EXISTS user_promo_vouchers_discount_mode_check;
ALTER TABLE user_promo_vouchers ADD CONSTRAINT user_promo_vouchers_discount_mode_check
  CHECK (discount_mode IN ('fixed_baht', 'percent'));

COMMENT ON COLUMN user_promo_vouchers.first_paid_job_only IS 'คัดลอกจากแบนเนอร์ตอนรับโค้ด — บังคับตอนใช้ส่วนลด';
