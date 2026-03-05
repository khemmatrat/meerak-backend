-- =================================================================================
-- 018: อัตราประกันแยกตามหมวดงาน (สำหรับ 20 งาน / หลาย category)
-- =================================================================================

CREATE TABLE IF NOT EXISTS insurance_rate_by_category (
  category VARCHAR(100) PRIMARY KEY,
  rate_percent NUMERIC(5,2) NOT NULL DEFAULT 10 CHECK (rate_percent >= 0 AND rate_percent <= 100),
  display_name VARCHAR(255),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT
);

COMMENT ON TABLE insurance_rate_by_category IS 'อัตรา % เบี้ยประกันต่อหมวดงาน (ถ้าไม่มีใช้ค่าจาก insurance_settings)';

-- ใส่ค่าเริ่มต้นจาก 4 หมวด + default
INSERT INTO insurance_rate_by_category (category, rate_percent, display_name, updated_at)
VALUES
  ('maid', 10, 'แม่บ้าน', NOW()),
  ('detective', 15, 'นักสืบ', NOW()),
  ('logistics', 12, 'ขนส่ง', NOW()),
  ('ac_cleaning', 10, 'ล้างแอร์', NOW()),
  ('default', 10, 'อื่นๆ (ค่าเริ่มต้น)', NOW())
ON CONFLICT (category) DO NOTHING;
