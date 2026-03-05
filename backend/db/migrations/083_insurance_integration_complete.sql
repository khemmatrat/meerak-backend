-- =================================================================================
-- 083: Insurance Integration Complete
-- =================================================================================
-- 1. platform_revenues: เพิ่ม source_type insurance_premium
-- 2. jobs: policy_number, insurance_coverage_status (trigger on start/complete)
-- 3. Ensure has_insurance, insurance_amount readable จาก payment_details
-- =================================================================================

-- 1. platform_revenues: รองรับ insurance_premium (เคลียร์ยอดกับบริษัทประกัน)
ALTER TABLE platform_revenues DROP CONSTRAINT IF EXISTS platform_revenues_source_type_check;
ALTER TABLE platform_revenues ADD CONSTRAINT platform_revenues_source_type_check
  CHECK (source_type IN (
    'withdrawal_fee_margin', 'deposit_margin_promptpay', 'deposit_margin_truemoney', 'deposit_margin_card',
    'insurance_premium'
  ));

-- 2. jobs: policy_number + insurance_coverage_status
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS policy_number VARCHAR(50);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS insurance_coverage_status VARCHAR(20) DEFAULT 'not_started'
  CHECK (insurance_coverage_status IN ('not_started', 'active', 'terminated'));
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS has_insurance BOOLEAN DEFAULT FALSE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS insurance_amount NUMERIC(12,2) DEFAULT 0;
COMMENT ON COLUMN jobs.policy_number IS 'AQ-INS-YYYYMMDD-XXX เปิดกรมธรรม์เมื่อ Start Job';
COMMENT ON COLUMN jobs.insurance_coverage_status IS 'not_started=ยังไม่เริ่ม | active=คุ้มครอง (Check-in) | terminated=สิ้นสุด (Complete)';
